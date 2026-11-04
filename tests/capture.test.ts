import { describe, expect, it } from 'vitest';
import { displayForRect, layoutFingerprint, orderDisplays, type NativeDisplay, type NativeWindow } from '../src/capture/types.ts';
import { targets } from '../src/capture.ts';

const displays: NativeDisplay[] = [
  { id: '\\\\.\\DISPLAY2', primary: true, x: 0, y: 0, width: 1920, height: 1080 },
  { id: '\\\\.\\DISPLAY1', primary: false, x: -1280, y: 100, width: 1280, height: 1024 },
];

describe('native capture metadata', () => {
  it('orders displays from left to right and fingerprints the physical layout', () => {
    expect(orderDisplays(displays).map((entry) => entry.id)).toEqual(['\\\\.\\DISPLAY1', '\\\\.\\DISPLAY2']);
    expect(layoutFingerprint(displays)).toContain('DISPLAY1@-1280,100,1280x1024');
  });

  it('maps a window to the display containing its centre', () => {
    expect(displayForRect(displays, -900, 200, 600, 500)).toBe('\\\\.\\DISPLAY1');
    expect(displayForRect(displays, 200, 100, 800, 600)).toBe('\\\\.\\DISPLAY2');
    expect(displayForRect(displays, 5000, 5000, 100, 100)).toBeNull();
  });

  it('exposes useful display and window details without image bytes', () => {
    const windows: NativeWindow[] = [{
      handle: '1a2b', title: 'Example', app: 'example.exe', pid: 42,
      x: 10, y: 20, width: 800, height: 600, minimized: false, foreground: true, displayId: '\\\\.\\DISPLAY2',
    }];
    const listed = targets(orderDisplays(displays), windows);
    expect(listed.find((entry) => entry.id === '1a2b')).toMatchObject({ kind: 'window', label: 'Example' });
    expect(listed.find((entry) => entry.id === '1a2b')?.detail).toContain('example.exe');
  });
});
