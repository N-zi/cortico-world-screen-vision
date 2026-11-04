import { describe, expect, it, vi } from 'vitest';
import { chatCompletionsUrl, inspectImage, listModels, modelsUrl, parseResult } from '../src/vision-client.ts';
import { SCREEN_VISION_DEFAULTS } from '../src/config.ts';

describe('vision client', () => {
  it('accepts HTTPS and appends chat/completions', () => {
    expect(chatCompletionsUrl('https://api.siliconflow.cn/v1/').toString()).toBe('https://api.siliconflow.cn/v1/chat/completions');
    expect(() => chatCompletionsUrl('http://example.com/v1')).toThrow(/HTTPS/);
    expect(modelsUrl('https://api.siliconflow.cn/v1/').toString()).toBe('https://api.siliconflow.cn/v1/models');
  });
  it('loads, deduplicates, and sorts model ids', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'z-model' }, { id: 'a-model' }, { id: 'z-model' }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(listModels({ baseUrl: 'https://example.com/v1', apiKey: 'key', fetchImpl })).resolves.toEqual(['a-model', 'z-model']);
  });
  it('never sends a request without a key', async () => {
    const fetchImpl = vi.fn();
    await expect(inspectImage({ cfg: { ...SCREEN_VISION_DEFAULTS, model: 'vision' }, apiKey: '', png: new Uint8Array([1]), scheduled: false, previousSummary: '', fetchImpl })).rejects.toThrow(/API Key/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('sends an in-memory data URL and parses structured output', async () => {
    const fetchImpl = vi.fn(async (_url: URL, init?: RequestInit) => {
      const body = String(init?.body);
      expect(body).toContain('data:image/png;base64,AQID');
      expect(body).toContain('json_object');
      expect(JSON.parse(body).max_tokens).toBe(1024);
      expect(init?.headers).toEqual(expect.objectContaining({ authorization: 'Bearer secret-test-key' }));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"noteworthy":true,"summary":"done","change":"changed","suggestedMessage":"look"}' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await inspectImage({ cfg: { ...SCREEN_VISION_DEFAULTS, model: 'vision' }, apiKey: 'secret-test-key', png: new Uint8Array([1, 2, 3]), scheduled: true, previousSummary: 'old', fetchImpl });
    expect(result).toEqual({ noteworthy: true, summary: 'done', change: 'changed', suggestedMessage: 'look' });
  });
  it('extracts JSON surrounded by model commentary', () => {
    expect(parseResult('Here is the result:\n```json\n{"noteworthy":false,"summary":"visible","change":"","suggestedMessage":""}\n```')).toEqual({
      noteworthy: false, summary: 'visible', change: '', suggestedMessage: '',
    });
  });
  it('uses plain text as a safe summary instead of failing', () => {
    expect(parseResult('A browser window is visible.', false)).toEqual({
      noteworthy: false,
      summary: 'A browser window is visible.',
      change: '',
      suggestedMessage: 'A browser window is visible.',
    });
    expect(parseResult('No obvious change.', true).noteworthy).toBe(false);
  });
  it('retries without response_format when the endpoint rejects it', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"unsupported"}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'plain result' } }] }), { status: 200 })) as unknown as typeof fetch;
    const result = await inspectImage({ cfg: { ...SCREEN_VISION_DEFAULTS, model: 'vision' }, apiKey: 'key', png: new Uint8Array([1]), scheduled: false, previousSummary: '', fetchImpl });
    expect(result.summary).toBe('plain result');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1]?.body));
    expect(retryBody.response_format).toBeUndefined();
  });
  it('includes the provider error message without echoing authorization', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'model does not support images' } }), { status: 400 })) as unknown as typeof fetch;
    await expect(listModels({ baseUrl: 'https://example.com/v1', apiKey: 'secret', fetchImpl })).rejects.toThrow('model does not support images');
  });
});
