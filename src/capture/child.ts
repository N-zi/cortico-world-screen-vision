/** Native capture worker. A native crash ends only this child process. */
import { captureDisplay, captureWindow, displays, toPng, windows } from './win32.ts';
import { layoutFingerprint } from './types.ts';
import type { ChildMessage, ParentMessage } from './types.ts';

process.on('message', (message: ParentMessage) => {
  const { id, request } = message;
  void Promise.resolve().then(() => {
    const active = displays();
    const layout = layoutFingerprint(active);
    if (request.op === 'list') return { displays: active, windows: windows(active), layout };
    let image;
    if (request.mode === 'desktop') {
      if (!active.length) throw new Error('没有检测到显示器。');
      const left = Math.min(...active.map((d) => d.x)); const top = Math.min(...active.map((d) => d.y));
      const right = Math.max(...active.map((d) => d.x + d.width)); const bottom = Math.max(...active.map((d) => d.y + d.height));
      image = captureDisplay({ id: 'desktop', primary: false, x: left, y: top, width: right - left, height: bottom - top });
    } else if (request.mode === 'display') {
      const target = active.find((display) => display.id === request.targetId);
      if (!target) throw new Error('所选显示器已断开；未回退到其他显示器。');
      image = captureDisplay(target);
    } else {
      windows(active);
      image = captureWindow(request.targetId);
    }
    return { png: toPng(image), width: image.width, height: image.height, layout };
  }).then(
    (value) => process.send?.({ id, ok: true, value } satisfies ChildMessage),
    (error: unknown) => process.send?.({ id, ok: false, error: safeError(error) } satisfies ChildMessage),
  );
});

process.on('disconnect', () => process.exit(0));
function safeError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 500); }
