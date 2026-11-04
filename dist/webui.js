// src/webui/client.ts
function errText(error) {
  return error instanceof Error ? error.message : String(error);
}
function mountDebug(ctx) {
  const { ui, root } = ctx;
  const zh = ctx.language === "zh" || ctx.language === "zh-Hant";
  const status = ui.msgline(zh ? "\u6B63\u5728\u8BFB\u53D6\u72B6\u6001\u2026" : "Loading\u2026");
  const key = ui.input({ type: "password", placeholder: zh ? "\u8F93\u5165\u65B0\u7684 API Key\uFF08\u4E0D\u4F1A\u56DE\u663E\uFF09" : "Enter a new API key" });
  const saveKey = ui.button(zh ? "\u4FDD\u5B58 API Key" : "Save API key", { variant: "primary" });
  const clearKey = ui.button(zh ? "\u6E05\u9664 API Key" : "Clear API key", { variant: "danger" });
  const modelSelect = ui.select({ options: [] });
  const loadModels = ui.button(zh ? "\u83B7\u53D6\u6A21\u578B\u5217\u8868" : "Load models");
  const saveModel = ui.button(zh ? "\u4FDD\u5B58\u6A21\u578B" : "Save model", { variant: "primary" });
  const refresh = ui.button(zh ? "\u5237\u65B0\u76EE\u6807" : "Refresh targets");
  const select = ui.select({ options: [{ value: "desktop|desktop", label: zh ? "\u6574\u4E2A\u684C\u9762" : "Entire desktop" }] });
  const saveTarget = ui.button(zh ? "\u4FDD\u5B58\u622A\u56FE\u76EE\u6807" : "Save target");
  const test = ui.button(zh ? "\u622A\u56FE\u5E76\u6D4B\u8BD5\u8BC6\u522B" : "Capture and test", { variant: "primary" });
  const result = ui.msgline();
  const keySheet = ui.sheet({ title: zh ? "API Key" : "API key", desc: zh ? "\u5BC6\u94A5\u4FDD\u5B58\u5728\u90E8\u7F72 .env\uFF1B\u9875\u9762\u53EA\u80FD\u770B\u5230\u662F\u5426\u5DF2\u8BBE\u7F6E\u3002" : "Stored in the deployment .env; the page only sees whether it is set." });
  keySheet.body.append(ui.field(zh ? "\u65B0\u5BC6\u94A5" : "New secret", key), ui.actions());
  keySheet.body.lastElementChild.append(saveKey, clearKey);
  const modelSheet = ui.sheet({ title: zh ? "\u89C6\u89C9\u6A21\u578B" : "Vision model", desc: zh ? "\u4ECE\u5F53\u524D Base URL \u83B7\u53D6\u6A21\u578B ID\u3002\u5217\u8868\u53EF\u80FD\u5305\u542B\u4E0D\u652F\u6301\u56FE\u7247\u7684\u6A21\u578B\uFF0C\u8BF7\u9009\u62E9\u89C6\u89C9\u6A21\u578B\u3002" : "Loads model IDs from the current Base URL. The list may include text-only models; choose a vision-capable model." });
  modelSheet.body.append(ui.field(zh ? "\u6A21\u578B ID" : "Model ID", modelSelect));
  const modelActions = ui.actions();
  modelActions.append(loadModels, saveModel);
  modelSheet.body.append(modelActions);
  const targetSheet = ui.sheet({ title: zh ? "\u622A\u56FE\u76EE\u6807" : "Capture target", desc: zh ? "\u7A97\u53E3\u4E0D\u5B58\u5728\u3001\u6700\u5C0F\u5316\u6216\u663E\u793A\u5668\u65AD\u5F00\u65F6\u4E0D\u4F1A\u56DE\u9000\u5230\u5176\u4ED6\u76EE\u6807\u3002" : "Missing/minimized windows and disconnected displays never fall back to another target." });
  targetSheet.body.append(ui.field(zh ? "\u76EE\u6807" : "Target", select));
  const targetActions = ui.actions();
  targetActions.append(refresh, saveTarget);
  targetSheet.body.append(targetActions);
  const testSheet = ui.sheet({ title: zh ? "\u8C03\u8BD5\u6D4B\u8BD5" : "Debug test", desc: zh ? "\u622A\u56FE\u4EC5\u5728\u5185\u5B58\u4E2D\u53D1\u9001\u7ED9\u5DF2\u914D\u7F6E\u7684\u89C6\u89C9\u63A5\u53E3\uFF0C\u4E0D\u5728\u9875\u9762\u9884\u89C8\u3002" : "The screenshot stays in memory and is sent only to the configured vision endpoint; no preview is shown." });
  const testActions = ui.actions();
  testActions.append(test);
  testSheet.body.append(testActions, result);
  root.append(status, keySheet.el, modelSheet.el, targetSheet.el, testSheet.el);
  const loadState = async () => {
    const state = await ctx.invoke("state");
    status.textContent = `${state.keySet ? zh ? "API Key \u5DF2\u8BBE\u7F6E" : "API key set" : zh ? "API Key \u672A\u8BBE\u7F6E" : "API key missing"} \xB7 ${state.targetLabel || state.captureMode}${state.lastError ? ` \xB7 ${state.lastError}` : ""}`;
    return state;
  };
  const loadTargets = async () => {
    result.textContent = zh ? "\u6B63\u5728\u679A\u4E3E\u663E\u793A\u5668\u548C\u7A97\u53E3\u2026" : "Listing displays and windows\u2026";
    try {
      const [state, targets] = await Promise.all([loadState(), ctx.invoke("targets")]);
      const options = [{ value: "desktop|desktop", label: zh ? "\u6574\u4E2A\u684C\u9762" : "Entire desktop" }, ...targets.map((t) => ({ value: `${t.kind}|${t.id}`, label: `${t.kind === "display" ? zh ? "\u663E\u793A\u5668" : "Display" : zh ? "\u7A97\u53E3" : "Window"} \xB7 ${t.label}` }))];
      select.replaceChildren(...options.map((o) => {
        const el = document.createElement("option");
        el.value = o.value;
        el.textContent = o.label;
        return el;
      }));
      const wanted = `${state.captureMode}|${state.targetId}`;
      if (options.some((o) => o.value === wanted)) select.value = wanted;
      result.textContent = "";
    } catch (error) {
      result.textContent = errText(error);
      result.classList.add("bad");
    }
  };
  saveKey.addEventListener("click", () => void (async () => {
    try {
      await ctx.invoke("saveKey", [key.value]);
      key.value = "";
      await loadState();
      ui.toast(zh ? "API Key \u5DF2\u4FDD\u5B58" : "API key saved", "ok");
    } catch (error) {
      ui.toast(errText(error), "bad");
    }
  })(), { signal: ctx.signal });
  clearKey.addEventListener("click", () => void (async () => {
    const confirmed = await ui.confirm({ title: zh ? "\u6E05\u9664 API Key\uFF1F" : "Clear API key?", body: zh ? "\u539F\u5BC6\u94A5\u4F1A\u88AB\u4E0D\u53EF\u6062\u590D\u5730\u8986\u76D6\u3002" : "The previous key will be overwritten and cannot be recovered.", danger: true });
    if (!confirmed) return;
    try {
      await ctx.invoke("clearKey");
      await loadState();
      ui.toast(zh ? "API Key \u5DF2\u6E05\u9664" : "API key cleared", "ok");
    } catch (error) {
      ui.toast(errText(error), "bad");
    }
  })(), { signal: ctx.signal });
  loadModels.addEventListener("click", () => void (async () => {
    const busy = ui.busy(zh ? "\u6B63\u5728\u83B7\u53D6\u6A21\u578B\u5217\u8868" : "Loading models");
    try {
      const [models, state] = await Promise.all([ctx.invoke("models"), loadState()]);
      modelSelect.replaceChildren(...models.map((id) => {
        const el = document.createElement("option");
        el.value = id;
        el.textContent = id;
        return el;
      }));
      if (!models.length) throw new Error(zh ? "\u63A5\u53E3\u6CA1\u6709\u8FD4\u56DE\u6A21\u578B\u3002" : "The endpoint returned no models.");
      if (models.includes(state.model)) modelSelect.value = state.model;
      ui.toast(zh ? `\u5DF2\u83B7\u53D6 ${models.length} \u4E2A\u6A21\u578B` : `Loaded ${models.length} models`, "ok");
    } catch (error) {
      ui.toast(errText(error), "bad");
    } finally {
      busy.dispose();
    }
  })(), { signal: ctx.signal });
  saveModel.addEventListener("click", () => void (async () => {
    try {
      await ctx.invoke("saveModel", [modelSelect.value]);
      ui.toast(zh ? "\u6A21\u578B\u5DF2\u4FDD\u5B58" : "Model saved", "ok");
    } catch (error) {
      ui.toast(errText(error), "bad");
    }
  })(), { signal: ctx.signal });
  refresh.addEventListener("click", () => void loadTargets(), { signal: ctx.signal });
  saveTarget.addEventListener("click", () => void (async () => {
    const [mode, id] = select.value.split("|", 2);
    const label = select.selectedOptions[0]?.textContent ?? id;
    try {
      await ctx.invoke("saveTarget", [mode, id, label]);
      await loadState();
      ui.toast(zh ? "\u622A\u56FE\u76EE\u6807\u5DF2\u4FDD\u5B58" : "Target saved", "ok");
      await ctx.refresh();
    } catch (error) {
      ui.toast(errText(error), "bad");
    }
  })(), { signal: ctx.signal });
  test.addEventListener("click", () => void (async () => {
    const busy = ui.busy(zh ? "\u6B63\u5728\u622A\u56FE\u5E76\u8BC6\u522B" : "Capturing and inspecting");
    result.classList.remove("bad");
    try {
      const out = await ctx.invoke("test");
      result.textContent = `${out.summary}${out.change ? `
${out.change}` : ""}`;
    } catch (error) {
      result.textContent = errText(error);
      result.classList.add("bad");
    } finally {
      busy.dispose();
      await loadState().catch(() => void 0);
    }
  })(), { signal: ctx.signal });
  void loadTargets();
}
var bundle = { panels: { debug: { mount: mountDebug } } };
var client_default = bundle;
export {
  client_default as default
};
