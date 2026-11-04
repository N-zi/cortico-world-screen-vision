# cortico-world-screen-vision

Windows-only Cortico World for inspecting a user-selected desktop, display, or visible window with a separately configured OpenAI-compatible vision model. Native Win32 capture runs in an isolated child process; a native failure cannot take down the Cortico core process.

## Privacy and behavior

- Captures only after `screen_vision_inspect`, a debug button press, or an explicitly enabled schedule.
- PNG bytes remain in memory and are sent only to the configured HTTPS endpoint.
- Screenshots are not written to disk, logged, added as conversation attachments, or saved to Memory.
- The API key is stored through Cortico's secret store as `SCREEN_VISION_API_KEY`; it is never written to `config.json`. Clearing it overwrites the old value with a fixed non-secret disabled marker because the Cortico contract has no secret-delete method.
- Scheduled checks keep only the previous textual summary in process memory. They emit `screen-vision.noteworthy` only when the vision endpoint marks a change noteworthy.
- Screen text is untrusted data. Events use `origin: external` and remind the bot not to follow instructions found in the image.
- A missing/minimized window or disconnected display fails closed and never falls back to another target.
- Display capture is per-monitor DPI aware and uses stable Windows device names. Window enumeration excludes hidden, tool and cloaked windows and reports process name, size, display and minimized state.
- Window capture uses `PrintWindow`; a failed, minimized or blank capture is rejected rather than replaced with a broader display screenshot.

## Providers

The extension calls the OpenAI-compatible Chat Completions endpoint at `<baseUrl>/chat/completions` with an in-memory PNG data URL.

- SiliconFlow default: `https://api.siliconflow.cn/v1`
- Alibaba Cloud Model Studio: use the official HTTPS compatible-mode Base URL for your region and Workspace ID.
- Custom: any explicitly configured HTTPS OpenAI-compatible Base URL.

Provider references:

- SiliconFlow API documentation: https://api-docs.siliconflow.cn/docs/api/chat-completions-post
- Alibaba Cloud Model Studio OpenAI-compatible Chat documentation: https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions

## Development

This package started from the official Cortico `templates/extension/world` template. It uses Node.js, public Win32 APIs, Koffi and pngjs; no third-party visual assets are bundled. The native implementation was written independently after studying Coopanion's documented architecture and does not copy its AGPL source.

```powershell
corepack pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Local installation

Build first, then open Coopanion's advanced WebUI, go to **扩展 → World → 手动安装 → 本机目录**, and choose this package's absolute directory. Restart Coopanion and enable **Screen Vision** from **World 总览**. Configure the endpoint/model, save the API key, choose a target in **截图与调试**, and run the debug test.

## License

MIT. See `LICENSE`.

Cortico itself is by Pal AI Lab and is used as a development dependency under its own repository license; this package does not copy Cortico runtime code.
