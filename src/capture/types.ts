export interface NativeDisplay {
  id: string;
  primary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeWindow {
  handle: string;
  title: string;
  app: string | null;
  pid: number;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  foreground: boolean;
  displayId: string | null;
}

export type CaptureRequest =
  | { op: 'list' }
  | { op: 'capture'; mode: 'desktop' | 'display' | 'window'; targetId: string };

export type CaptureResponse =
  | { displays: NativeDisplay[]; windows: NativeWindow[]; layout: string }
  | { png: Uint8Array; width: number; height: number; layout: string };

export type ParentMessage = { id: number; request: CaptureRequest };
export type ChildMessage = { id: number; ok: true; value: CaptureResponse } | { id: number; ok: false; error: string };

export function orderDisplays(displays: readonly NativeDisplay[]): NativeDisplay[] {
  return [...displays].sort((a, b) => a.x - b.x || a.y - b.y);
}

export function layoutFingerprint(displays: readonly NativeDisplay[]): string {
  return orderDisplays(displays).map((d) => `${d.id}@${d.x},${d.y},${d.width}x${d.height}`).join('|');
}

export function displayForRect(displays: readonly NativeDisplay[], x: number, y: number, width: number, height: number): string | null {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return displays.find((d) => cx >= d.x && cy >= d.y && cx < d.x + d.width && cy < d.y + d.height)?.id ?? null;
}
