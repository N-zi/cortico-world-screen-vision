import type { WebUiClientBundle, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

interface Target { id: string; label: string; kind: 'display' | 'window'; detail?: string }
interface State { keySet: boolean; captureMode: 'desktop' | 'display' | 'window'; targetId: string; targetLabel: string; model: string; running: boolean; lastRunAt: string; lastError: string }

function errText(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function mountDebug(ctx: WebUiPanelContext): void {
  const { ui, root } = ctx;
  const zh = ctx.language === 'zh' || ctx.language === 'zh-Hant';
  const status = ui.msgline(zh ? '正在读取状态…' : 'Loading…');
  const key = ui.input({ type: 'password', placeholder: zh ? '输入新的 API Key（不会回显）' : 'Enter a new API key' });
  const saveKey = ui.button(zh ? '保存 API Key' : 'Save API key', { variant: 'primary' });
  const clearKey = ui.button(zh ? '清除 API Key' : 'Clear API key', { variant: 'danger' });
  const modelSelect = ui.select({ options: [] });
  const loadModels = ui.button(zh ? '获取模型列表' : 'Load models');
  const saveModel = ui.button(zh ? '保存模型' : 'Save model', { variant: 'primary' });
  const refresh = ui.button(zh ? '刷新目标' : 'Refresh targets');
  const select = ui.select({ options: [{ value: 'desktop|desktop', label: zh ? '整个桌面' : 'Entire desktop' }] });
  const saveTarget = ui.button(zh ? '保存截图目标' : 'Save target');
  const test = ui.button(zh ? '截图并测试识别' : 'Capture and test', { variant: 'primary' });
  const result = ui.msgline();

  const keySheet = ui.sheet({ title: zh ? 'API Key' : 'API key', desc: zh ? '密钥保存在部署 .env；页面只能看到是否已设置。' : 'Stored in the deployment .env; the page only sees whether it is set.' });
  keySheet.body.append(ui.field(zh ? '新密钥' : 'New secret', key), ui.actions());
  keySheet.body.lastElementChild!.append(saveKey, clearKey);
  const modelSheet = ui.sheet({ title: zh ? '视觉模型' : 'Vision model', desc: zh ? '从当前 Base URL 获取模型 ID。列表可能包含不支持图片的模型，请选择视觉模型。' : 'Loads model IDs from the current Base URL. The list may include text-only models; choose a vision-capable model.' });
  modelSheet.body.append(ui.field(zh ? '模型 ID' : 'Model ID', modelSelect));
  const modelActions = ui.actions(); modelActions.append(loadModels, saveModel); modelSheet.body.append(modelActions);
  const targetSheet = ui.sheet({ title: zh ? '截图目标' : 'Capture target', desc: zh ? '窗口不存在、最小化或显示器断开时不会回退到其他目标。' : 'Missing/minimized windows and disconnected displays never fall back to another target.' });
  targetSheet.body.append(ui.field(zh ? '目标' : 'Target', select));
  const targetActions = ui.actions(); targetActions.append(refresh, saveTarget); targetSheet.body.append(targetActions);
  const testSheet = ui.sheet({ title: zh ? '调试测试' : 'Debug test', desc: zh ? '截图仅在内存中发送给已配置的视觉接口，不在页面预览。' : 'The screenshot stays in memory and is sent only to the configured vision endpoint; no preview is shown.' });
  const testActions = ui.actions(); testActions.append(test); testSheet.body.append(testActions, result);
  root.append(status, keySheet.el, modelSheet.el, targetSheet.el, testSheet.el);

  const loadState = async (): Promise<State> => {
    const state = await ctx.invoke<State>('state');
    status.textContent = `${state.keySet ? (zh ? 'API Key 已设置' : 'API key set') : (zh ? 'API Key 未设置' : 'API key missing')} · ${state.targetLabel || state.captureMode}${state.lastError ? ` · ${state.lastError}` : ''}`;
    return state;
  };
  const loadTargets = async (): Promise<void> => {
    result.textContent = zh ? '正在枚举显示器和窗口…' : 'Listing displays and windows…';
    try {
      const [state, targets] = await Promise.all([loadState(), ctx.invoke<Target[]>('targets')]);
      const options = [{ value: 'desktop|desktop', label: zh ? '整个桌面' : 'Entire desktop' }, ...targets.map((t) => ({ value: `${t.kind}|${t.id}`, label: `${t.kind === 'display' ? (zh ? '显示器' : 'Display') : (zh ? '窗口' : 'Window')} · ${t.label}` }))];
      select.replaceChildren(...options.map((o) => { const el = document.createElement('option'); el.value = o.value; el.textContent = o.label; return el; }));
      const wanted = `${state.captureMode}|${state.targetId}`;
      if (options.some((o) => o.value === wanted)) select.value = wanted;
      result.textContent = '';
    } catch (error) { result.textContent = errText(error); result.classList.add('bad'); }
  };
  saveKey.addEventListener('click', () => void (async () => {
    try { await ctx.invoke('saveKey', [key.value]); key.value = ''; await loadState(); ui.toast(zh ? 'API Key 已保存' : 'API key saved', 'ok'); }
    catch (error) { ui.toast(errText(error), 'bad'); }
  })(), { signal: ctx.signal });
  clearKey.addEventListener('click', () => void (async () => {
    const confirmed = await ui.confirm({ title: zh ? '清除 API Key？' : 'Clear API key?', body: zh ? '原密钥会被不可恢复地覆盖。' : 'The previous key will be overwritten and cannot be recovered.', danger: true });
    if (!confirmed) return;
    try { await ctx.invoke('clearKey'); await loadState(); ui.toast(zh ? 'API Key 已清除' : 'API key cleared', 'ok'); }
    catch (error) { ui.toast(errText(error), 'bad'); }
  })(), { signal: ctx.signal });
  loadModels.addEventListener('click', () => void (async () => {
    const busy = ui.busy(zh ? '正在获取模型列表' : 'Loading models');
    try {
      const [models, state] = await Promise.all([ctx.invoke<string[]>('models'), loadState()]);
      modelSelect.replaceChildren(...models.map((id) => { const el = document.createElement('option'); el.value = id; el.textContent = id; return el; }));
      if (!models.length) throw new Error(zh ? '接口没有返回模型。' : 'The endpoint returned no models.');
      if (models.includes(state.model)) modelSelect.value = state.model;
      ui.toast(zh ? `已获取 ${models.length} 个模型` : `Loaded ${models.length} models`, 'ok');
    } catch (error) { ui.toast(errText(error), 'bad'); }
    finally { busy.dispose(); }
  })(), { signal: ctx.signal });
  saveModel.addEventListener('click', () => void (async () => {
    try { await ctx.invoke('saveModel', [modelSelect.value]); ui.toast(zh ? '模型已保存' : 'Model saved', 'ok'); }
    catch (error) { ui.toast(errText(error), 'bad'); }
  })(), { signal: ctx.signal });
  refresh.addEventListener('click', () => void loadTargets(), { signal: ctx.signal });
  saveTarget.addEventListener('click', () => void (async () => {
    const [mode, id] = select.value.split('|', 2) as ['desktop' | 'display' | 'window', string];
    const label = select.selectedOptions[0]?.textContent ?? id;
    try { await ctx.invoke('saveTarget', [mode, id, label]); await loadState(); ui.toast(zh ? '截图目标已保存' : 'Target saved', 'ok'); await ctx.refresh(); }
    catch (error) { ui.toast(errText(error), 'bad'); }
  })(), { signal: ctx.signal });
  test.addEventListener('click', () => void (async () => {
    const busy = ui.busy(zh ? '正在截图并识别' : 'Capturing and inspecting');
    result.classList.remove('bad');
    try {
      const out = await ctx.invoke<{ summary: string; change: string; noteworthy: boolean }>('test');
      result.textContent = `${out.summary}${out.change ? `\n${out.change}` : ''}`;
    } catch (error) { result.textContent = errText(error); result.classList.add('bad'); }
    finally { busy.dispose(); await loadState().catch(() => undefined); }
  })(), { signal: ctx.signal });
  void loadTargets();
}

const bundle: WebUiClientBundle = { panels: { debug: { mount: mountDebug } } };
export default bundle;
