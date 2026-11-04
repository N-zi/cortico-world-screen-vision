import type { ScreenVisionConfigSection } from './config.ts';

export interface VisionResult {
  noteworthy: boolean;
  summary: string;
  change: string;
  suggestedMessage: string;
}

export function chatCompletionsUrl(baseUrl: string): URL {
  const url = new URL(baseUrl.trim());
  if (url.protocol !== 'https:') throw new Error('Base URL 必须使用 HTTPS。');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`;
  url.search = '';
  url.hash = '';
  return url;
}

export function modelsUrl(baseUrl: string): URL {
  const url = new URL(baseUrl.trim());
  if (url.protocol !== 'https:') throw new Error('Base URL 必须使用 HTTPS。');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`;
  url.search = '';
  url.hash = '';
  return url;
}

export async function listModels(options: {
  baseUrl: string;
  apiKey: string;
  timeoutSeconds?: number;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  if (!options.apiKey) throw new Error('尚未设置 API Key。');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5, options.timeoutSeconds ?? 30) * 1000);
  try {
    const response = await (options.fetchImpl ?? fetch)(modelsUrl(options.baseUrl), {
      headers: { authorization: `Bearer ${options.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await httpError(response));
    const json = await response.json() as { data?: unknown; models?: unknown };
    const entries = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];
    const ids = entries.map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string') return (entry as { id: string }).id;
      return '';
    }).filter(Boolean);
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (controller.signal.aborted) throw new Error('获取模型列表超时。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function httpError(response: Response): Promise<string> {
  let detail = '';
  try {
    const text = (await response.text()).slice(0, 2000);
    try {
      const json = JSON.parse(text) as { error?: unknown; message?: unknown };
      const nested = json.error && typeof json.error === 'object' ? (json.error as { message?: unknown }).message : undefined;
      detail = typeof nested === 'string' ? nested : typeof json.message === 'string' ? json.message : '';
    } catch { detail = text; }
  } catch { /* Keep the status-only error. */ }
  detail = detail.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
  return `视觉接口返回 HTTP ${response.status}${detail ? `：${detail}` : '。'}`;
}

export function parseResult(text: string, scheduled = false): VisionResult {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let raw: unknown = null;
  const candidates = [stripped];
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(stripped.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) { raw = parsed; break; }
    } catch { /* Try the next representation, then fall back to plain text. */ }
  }
  if (!raw) {
    if (!stripped) throw new Error('视觉接口没有返回文字结果。');
    return { noteworthy: false, summary: stripped, change: '', suggestedMessage: scheduled ? '' : stripped };
  }
  const obj = raw as Record<string, unknown>;
  return {
    noteworthy: obj.noteworthy === true,
    summary: typeof obj.summary === 'string' ? obj.summary.trim() : '',
    change: typeof obj.change === 'string' ? obj.change.trim() : '',
    suggestedMessage: typeof obj.suggestedMessage === 'string' ? obj.suggestedMessage.trim() : '',
  };
}

export async function inspectImage(options: {
  cfg: ScreenVisionConfigSection;
  apiKey: string;
  png: Uint8Array;
  scheduled: boolean;
  previousSummary: string;
  fetchImpl?: typeof fetch;
}): Promise<VisionResult> {
  if (!options.apiKey) throw new Error('尚未设置 API Key。');
  if (!options.cfg.model.trim()) throw new Error('尚未设置视觉模型 ID。');
  const endpoint = chatCompletionsUrl(options.cfg.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5, options.cfg.requestTimeoutSeconds) * 1000);
  const instruction = [
    options.cfg.prompt,
    'Return only one JSON object with keys: noteworthy (boolean), summary (string), change (string), suggestedMessage (string).',
    options.scheduled
      ? `This is a scheduled check. Previous textual summary: ${options.previousSummary || '(no baseline yet)'}. Set noteworthy=true only for a genuinely useful or important change.`
      : 'This is a user-requested inspection. Describe the visible content in summary; noteworthy may be false.',
  ].join('\n\n');
  const body = {
    model: options.cfg.model.trim(),
    stream: false,
    temperature: 0.2,
    // Some OpenAI-compatible gateways default an omitted max_tokens to the
    // model's entire context window. Once the prompt and image are counted,
    // that default is invalid (for example 65536 + input > 65536).
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [
      { type: 'text', text: instruction },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from(options.png).toString('base64')}` } },
    ] }],
  };
  try {
    const fetcher = options.fetchImpl ?? fetch;
    const request = (payload: Record<string, unknown>) => fetcher(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    let response = await request(body);
    // Some OpenAI-compatible endpoints do not implement response_format. Retry
    // once without it only for request-shape errors; authentication/rate-limit
    // failures must not cause a duplicate request.
    if (response.status === 400 || response.status === 422) {
      const { response_format: _ignored, ...compatibleBody } = body;
      response = await request(compatibleBody);
    }
    if (!response.ok) throw new Error(await httpError(response));
    const json = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = json.choices?.[0]?.message?.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part) => part && typeof part === 'object' && 'text' in part ? String((part as { text?: unknown }).text ?? '') : '').join('\n')
        : '';
    if (!text.trim()) throw new Error('视觉接口没有返回文字结果。');
    return parseResult(text, options.scheduled);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('视觉接口请求超时。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
