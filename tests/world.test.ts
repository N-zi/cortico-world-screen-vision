import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { dryMountWorld } from 'cortico/extensions/dry-mount.ts';
import { SCREEN_VISION } from '../src/definition.ts';
import { SCREEN_VISION_DEFAULTS, normalizedIntervalMinutes } from '../src/config.ts';
import { ScreenVisionWorld } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';

let scratchDir: string;
beforeEach(() => { scratchDir = mkdtempSync(join(tmpdir(), 'screen-vision-world-')); });
afterEach(() => { vi.useRealTimers(); rmSync(scratchDir, { recursive: true, force: true }); });

function world(overrides: Partial<typeof SCREEN_VISION_DEFAULTS> = {}, result = { noteworthy: false, summary: 'screen', change: '', suggestedMessage: '' }) {
  const cfg = { ...SCREEN_VISION_DEFAULTS, model: 'vision', ...overrides };
  return new ScreenVisionWorld({
    cfg, timezone: 'Asia/Shanghai', packageDir: scratchDir,
    secret: () => 'test-key', storeSecret: () => undefined,
    persist: (patch) => Object.assign(cfg, patch),
    capture: async () => new Uint8Array([1, 2, 3]),
    inspect: async () => result,
    listTargets: async () => [],
  });
}

describe('Screen Vision World', () => {
  it('dry mounts with default config and no secret', async () => {
    const report = await dryMountWorld(SCREEN_VISION, { scratchDir });
    expect(report.failures).toEqual([]);
  });
  it('enforces a one-minute minimum interval', () => {
    expect(normalizedIntervalMinutes(0)).toBe(1);
    expect(normalizedIntervalMinutes(5.9)).toBe(5);
  });
  it('manual tool returns the model summary without pushing an event', async () => {
    const instance = world(); const host = new FakeHost(); await instance.start(host);
    const tool = instance.tools().find((entry) => entry.name === 'screen_vision_inspect')!;
    const text = await tool.handler({}, {} as ToolCallContext);
    expect(text).toContain('Summary: screen');
    expect(host.events).toEqual([]);
    await instance.stop();
  });
  it('scheduled noteworthy result immediately asks for one pet bubble message', async () => {
    vi.useFakeTimers();
    const instance = world({ proactiveEnabled: true, intervalMinutes: 1 }, { noteworthy: true, summary: 'important', change: 'new dialog', suggestedMessage: 'take a look' });
    const host = new FakeHost(); await instance.start(host);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(host.events).toHaveLength(1);
    expect(host.events[0]).toMatchObject({ type: 'screen-vision.noteworthy', origin: 'external' });
    expect(host.events[0]?.text).toContain('现在调用一次 pet_say');
    expect(host.events[0]?.text).toContain('<vision_result>');
    expect(host.pushOpts[0]).toEqual({ trigger: 'flush' });
    await instance.stop();
  });
  it('scheduled non-noteworthy result stays quiet', async () => {
    vi.useFakeTimers();
    const instance = world({ proactiveEnabled: true, intervalMinutes: 1 });
    const host = new FakeHost(); await instance.start(host);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(host.events).toEqual([]);
    await instance.stop();
  });
  it('clears the key by overwriting it through the Cortico secret store', async () => {
    let stored = 'original-key';
    const cfg = { ...SCREEN_VISION_DEFAULTS, model: 'vision' };
    const instance = new ScreenVisionWorld({
      cfg, timezone: 'Asia/Shanghai', packageDir: scratchDir,
      secret: () => stored,
      storeSecret: (_name, value) => { stored = value; },
      persist: (patch) => Object.assign(cfg, patch),
      capture: async () => new Uint8Array([1]),
      inspect: async () => ({ noteworthy: false, summary: '', change: '', suggestedMessage: '' }),
      listTargets: async () => [],
    });
    const ui = instance.webUi!('zh');
    await ui.invoke!('debug', 'clearKey', []);
    const state = await ui.invoke!('debug', 'state', []) as { keySet: boolean };
    expect(state.keySet).toBe(false);
    expect(stored).not.toBe('original-key');
  });
});
