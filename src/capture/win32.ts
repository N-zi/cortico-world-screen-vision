/** Windows-only screen and window capture using public Win32 APIs through koffi. */
import koffi from 'koffi';
import { PNG } from 'pngjs';
import { basename } from 'node:path';
import type { NativeDisplay, NativeWindow } from './types.ts';
import { displayForRect, orderDisplays } from './types.ts';

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');
const kernel32 = koffi.load('kernel32.dll');
const dwmapi = koffi.load('dwmapi.dll');
koffi.alias('SV_HANDLE', 'void *');
koffi.alias('SV_HWND', 'SV_HANDLE');
const RECT = koffi.struct('SV_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const BMI = koffi.struct('SV_BITMAPINFOHEADER', {
  biSize: 'uint32_t', biWidth: 'int32_t', biHeight: 'int32_t', biPlanes: 'uint16_t', biBitCount: 'uint16_t',
  biCompression: 'uint32_t', biSizeImage: 'uint32_t', biXPelsPerMeter: 'int32_t', biYPelsPerMeter: 'int32_t',
  biClrUsed: 'uint32_t', biClrImportant: 'uint32_t',
});
const MONITOR = koffi.struct('SV_MONITORINFOEXW', {
  cbSize: 'uint32_t', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32_t', szDevice: koffi.array('char16_t', 32, 'String'),
});
const MonitorProc = koffi.proto('bool __stdcall SV_MonitorProc(SV_HANDLE, SV_HANDLE, void *, intptr_t)');
const WindowProc = koffi.proto('bool __stdcall SV_WindowProc(SV_HWND, intptr_t)');
const fn = {
  dpi: user32.func('bool __stdcall SetProcessDpiAwarenessContext(intptr_t)'),
  enumMonitors: user32.func('bool __stdcall EnumDisplayMonitors(SV_HANDLE, void *, SV_MonitorProc *, intptr_t)'),
  monitorInfo: user32.func('bool __stdcall GetMonitorInfoW(SV_HANDLE, _Inout_ SV_MONITORINFOEXW *)'),
  getDc: user32.func('SV_HANDLE __stdcall GetDC(SV_HWND)'),
  releaseDc: user32.func('int __stdcall ReleaseDC(SV_HWND, SV_HANDLE)'),
  createDc: gdi32.func('SV_HANDLE __stdcall CreateCompatibleDC(SV_HANDLE)'),
  createBitmap: gdi32.func('SV_HANDLE __stdcall CreateCompatibleBitmap(SV_HANDLE, int, int)'),
  select: gdi32.func('SV_HANDLE __stdcall SelectObject(SV_HANDLE, SV_HANDLE)'),
  deleteObject: gdi32.func('bool __stdcall DeleteObject(SV_HANDLE)'),
  deleteDc: gdi32.func('bool __stdcall DeleteDC(SV_HANDLE)'),
  bitBlt: gdi32.func('bool __stdcall BitBlt(SV_HANDLE, int, int, int, int, SV_HANDLE, int, int, uint32_t)'),
  dib: gdi32.func('int __stdcall GetDIBits(SV_HANDLE, SV_HANDLE, uint32_t, uint32_t, void *, _Inout_ SV_BITMAPINFOHEADER *, uint32_t)'),
  printWindow: user32.func('bool __stdcall PrintWindow(SV_HWND, SV_HANDLE, uint32_t)'),
  enumWindows: user32.func('bool __stdcall EnumWindows(SV_WindowProc *, intptr_t)'),
  visible: user32.func('bool __stdcall IsWindowVisible(SV_HWND)'),
  minimized: user32.func('bool __stdcall IsIconic(SV_HWND)'),
  text: user32.func('int __stdcall GetWindowTextW(SV_HWND, _Out_ uint16_t *, int)'),
  rect: user32.func('bool __stdcall GetWindowRect(SV_HWND, _Out_ SV_RECT *)'),
  exStyle: user32.func('intptr_t __stdcall GetWindowLongPtrW(SV_HWND, int)'),
  pid: user32.func('uint32_t __stdcall GetWindowThreadProcessId(SV_HWND, _Out_ uint32_t *)'),
  foreground: user32.func('SV_HWND __stdcall GetForegroundWindow()'),
  dwmInt: dwmapi.func('long __stdcall DwmGetWindowAttribute(SV_HWND, uint32_t, _Out_ int *, uint32_t)'),
  dwmRect: dwmapi.func('long __stdcall DwmGetWindowAttribute(SV_HWND, uint32_t, _Out_ SV_RECT *, uint32_t)'),
  openProcess: kernel32.func('SV_HANDLE __stdcall OpenProcess(uint32_t, bool, uint32_t)'),
  processName: kernel32.func('bool __stdcall QueryFullProcessImageNameW(SV_HANDLE, uint32_t, _Out_ uint16_t *, _Inout_ uint32_t *)'),
  close: kernel32.func('bool __stdcall CloseHandle(SV_HANDLE)'),
};

fn.dpi(-4);
const PRIMARY = 1;
const COPY = 0x00cc0020;
const CAPTURE_LAYERED = 0x40000000;
const TOOL_WINDOW = 0x80;
const EXSTYLE = -20;
const CLOAKED = 14;
const FRAME = 9;
const PROCESS_QUERY = 0x1000;

export function displays(): NativeDisplay[] {
  const found: NativeDisplay[] = [];
  fn.enumMonitors(null, null, (monitor: unknown) => {
    const info = { cbSize: koffi.sizeof(MONITOR), rcMonitor: emptyRect(), rcWork: emptyRect(), dwFlags: 0, szDevice: '' };
    if (fn.monitorInfo(monitor, info)) {
      const r = info.rcMonitor;
      found.push({ id: info.szDevice, primary: (info.dwFlags & PRIMARY) !== 0, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
    }
    return true;
  }, 0);
  return orderDisplays(found);
}

const handles = new Map<string, unknown>();
export function windows(activeDisplays = displays()): NativeWindow[] {
  handles.clear();
  const found: NativeWindow[] = [];
  const foreground = koffi.address(fn.foreground());
  fn.enumWindows((hwnd: unknown) => {
    if (!fn.visible(hwnd) || (Number(fn.exStyle(hwnd, EXSTYLE)) & TOOL_WINDOW)) return true;
    const cloaked = [0];
    if (fn.dwmInt(hwnd, CLOAKED, cloaked, 4) === 0 && cloaked[0]) return true;
    const titleBuffer = new Uint16Array(1024);
    const length = fn.text(hwnd, titleBuffer, titleBuffer.length);
    if (length < 1) return true;
    const rect = frameRect(hwnd);
    if (rect.width < 1 || rect.height < 1) return true;
    const pid = [0];
    fn.pid(hwnd, pid);
    const handle = koffi.address(hwnd).toString(16);
    handles.set(handle, hwnd);
    found.push({
      handle, title: String.fromCharCode(...titleBuffer.subarray(0, length)), app: processName(pid[0]), pid: pid[0],
      ...rect, minimized: Boolean(fn.minimized(hwnd)), foreground: koffi.address(hwnd) === foreground,
      displayId: displayForRect(activeDisplays, rect.x, rect.y, rect.width, rect.height),
    });
    return true;
  }, 0);
  return found;
}

export function captureDisplay(display: NativeDisplay): { width: number; height: number; bgra: Uint8Array } {
  return captureBitmap(display.width, display.height, (target) => {
    const screen = fn.getDc(null);
    try { return fn.bitBlt(target, 0, 0, display.width, display.height, screen, display.x, display.y, COPY | CAPTURE_LAYERED); }
    finally { fn.releaseDc(null, screen); }
  });
}

export function captureWindow(handle: string): { width: number; height: number; bgra: Uint8Array } {
  if (!handles.has(handle)) windows();
  const hwnd = handles.get(handle);
  if (!hwnd || !fn.visible(hwnd)) throw new Error('所选窗口已经关闭或不可见。');
  if (fn.minimized(hwnd)) throw new Error('所选窗口已最小化；为避免截取其他内容，已停止截图。');
  const rect = frameRect(hwnd);
  const image = captureBitmap(rect.width, rect.height, (target) => fn.printWindow(hwnd, target, 2));
  if (looksBlank(image.bgra)) throw new Error('窗口返回了空白画面；未回退截取显示器。');
  return image;
}

export function toPng(image: { width: number; height: number; bgra: Uint8Array }): Uint8Array {
  const rgba = Buffer.alloc(image.bgra.length);
  for (let i = 0; i < image.bgra.length; i += 4) {
    rgba[i] = image.bgra[i + 2]; rgba[i + 1] = image.bgra[i + 1]; rgba[i + 2] = image.bgra[i]; rgba[i + 3] = 255;
  }
  const png = new PNG({ width: image.width, height: image.height });
  png.data = rgba;
  return PNG.sync.write(png);
}

function captureBitmap(width: number, height: number, paint: (targetDc: unknown) => boolean): { width: number; height: number; bgra: Uint8Array } {
  if (width < 1 || height < 1 || width * height > 150_000_000) throw new Error('截图尺寸无效或过大。');
  const screen = fn.getDc(null);
  const memory = fn.createDc(screen);
  const bitmap = fn.createBitmap(screen, width, height);
  const previous = fn.select(memory, bitmap);
  try {
    if (!paint(memory)) throw new Error('Windows 截图接口返回失败。');
    const pixels = Buffer.alloc(width * height * 4);
    const header = { biSize: koffi.sizeof(BMI), biWidth: width, biHeight: -height, biPlanes: 1, biBitCount: 32, biCompression: 0, biSizeImage: 0, biXPelsPerMeter: 0, biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0 };
    if (fn.dib(memory, bitmap, 0, height, pixels, header, 0) !== height) throw new Error('Windows 无法读取截图像素。');
    return { width, height, bgra: pixels };
  } finally {
    fn.select(memory, previous); fn.deleteObject(bitmap); fn.deleteDc(memory); fn.releaseDc(null, screen);
  }
}

function frameRect(hwnd: unknown): { x: number; y: number; width: number; height: number } {
  const r = emptyRect();
  if (fn.dwmRect(hwnd, FRAME, r, koffi.sizeof(RECT)) !== 0 && !fn.rect(hwnd, r)) throw new Error('无法读取窗口边界。');
  return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
}
function processName(pid: number): string | null {
  const process = fn.openProcess(PROCESS_QUERY, false, pid);
  if (!process) return null;
  try {
    const buffer = new Uint16Array(2048); const size = [buffer.length];
    if (!fn.processName(process, 0, buffer, size)) return null;
    return basename(String.fromCharCode(...buffer.subarray(0, size[0])));
  } finally { fn.close(process); }
}
function looksBlank(bytes: Uint8Array): boolean {
  if (!bytes.length) return true;
  let min = 255, max = 0;
  for (let i = 0; i < bytes.length; i += Math.max(4, Math.floor(bytes.length / 4096 / 4) * 4)) {
    min = Math.min(min, bytes[i], bytes[i + 1], bytes[i + 2]); max = Math.max(max, bytes[i], bytes[i + 1], bytes[i + 2]);
  }
  return max - min < 2 && max < 8;
}
function emptyRect() { return { left: 0, top: 0, right: 0, bottom: 0 }; }
