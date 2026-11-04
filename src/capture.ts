import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { childExecArgv } from 'cortico/extensions/runtime.ts';
import type { CaptureMode } from './config.ts';
import type { ChildMessage, CaptureRequest, CaptureResponse, NativeDisplay, NativeWindow, ParentMessage } from './capture/types.ts';

const CHILD_FILE = fileURLToPath(new URL('./capture/child.ts', import.meta.url));
const TIMEOUT_MS = 30_000;

export interface CaptureTarget { id: string; label: string; kind: 'display' | 'window'; detail?: string; }

export class CaptureEngine {
  private child: ChildProcess | null = null;
  private sequence = 0;
  private pending = new Map<number, { child: ChildProcess; resolve(value: CaptureResponse): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();

  async listTargets(): Promise<CaptureTarget[]> {
    const response = await this.call({ op: 'list' });
    if (!('displays' in response)) throw new Error('截图子进程返回了错误的目标列表。');
    return targets(response.displays, response.windows);
  }

  async capture(mode: CaptureMode, targetId: string): Promise<Uint8Array> {
    const response = await this.call({ op: 'capture', mode, targetId });
    if (!('png' in response)) throw new Error('截图子进程没有返回图像。');
    return response.png;
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer); pending.reject(new Error('截图 World 已停止。')); this.pending.delete(id);
    }
    if (!child || child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.disconnect();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1500))]);
    if (child.exitCode === null) child.kill();
  }

  private call(request: CaptureRequest): Promise<CaptureResponse> {
    if (process.platform !== 'win32') return Promise.reject(new Error('Screen Vision 只支持 Windows。'));
    const child = this.child ?? this.spawn();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error('截图子进程响应超时。'));
        if (this.child === child) { this.child = null; child.kill('SIGKILL'); }
      }, TIMEOUT_MS);
      this.pending.set(id, { child, resolve, reject, timer });
      child.send({ id, request } satisfies ParentMessage);
    });
  }

  private spawn(): ChildProcess {
    const child = fork(CHILD_FILE, [], { execArgv: childExecArgv(), serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
    this.child = child;
    child.on('message', (message: ChildMessage) => {
      const pending = this.pending.get(message.id);
      if (!pending || pending.child !== child) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.value); else pending.reject(new Error(message.error));
    });
    child.on('exit', (code) => {
      if (this.child === child) this.child = null;
      for (const [id, pending] of this.pending) if (pending.child === child) {
        clearTimeout(pending.timer); pending.reject(new Error(`截图子进程异常退出${code === null ? '' : `（代码 ${code}）`}。`)); this.pending.delete(id);
      }
    });
    return child;
  }
}

let shared: CaptureEngine | null = null;
function engine(): CaptureEngine { return shared ??= new CaptureEngine(); }
export async function listCaptureTargets(): Promise<CaptureTarget[]> { return engine().listTargets(); }
export async function capturePng(mode: CaptureMode, targetId: string): Promise<Uint8Array> { return engine().capture(mode, targetId); }
export async function stopCaptureEngine(): Promise<void> { const value = shared; shared = null; await value?.stop(); }

export function targets(displays: NativeDisplay[], windows: NativeWindow[]): CaptureTarget[] {
  return [
    ...displays.map((display, index) => ({
      kind: 'display' as const, id: display.id,
      label: `显示器 ${index + 1} · ${display.id} (${display.width}×${display.height})`,
      detail: [display.primary ? '主显示器' : '', `${display.x},${display.y}`].filter(Boolean).join(' · '),
    })),
    ...windows.map((window) => ({
      kind: 'window' as const, id: window.handle, label: window.title,
      detail: [window.app, window.minimized ? '已最小化' : '', window.displayId, `${window.width}×${window.height}`].filter(Boolean).join(' · '),
    })),
  ];
}
