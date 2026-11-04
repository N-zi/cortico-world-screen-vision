import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { SCREEN_VISION_DEFAULTS, type ScreenVisionConfigSection } from './config.ts';
import { SCREEN_VISION_TOOL_DECLS, ScreenVisionWorld } from './world.ts';

export const SCREEN_VISION: WorldDefinition<ScreenVisionConfigSection> = {
  id: 'screen-vision',
  label: 'Screen Vision',
  defaults: () => ({ ...SCREEN_VISION_DEFAULTS }),
  create: (ctx) => new ScreenVisionWorld({
    cfg: ctx.cfg,
    timezone: ctx.timezone,
    packageDir: ctx.packageDir,
    secret: ctx.secret,
    storeSecret: ctx.storeSecret,
    persist: ctx.persist,
  }),
  describe: {
    tools: describeTools(SCREEN_VISION_TOOL_DECLS, {
      screen_vision_inspect: {
        zh: '截取已配置的桌面、显示器或窗口，并用独立视觉模型识别内容。',
        en: 'Captures the configured desktop, display, or window and inspects it with a separate vision model.',
      },
    }),
    events: [{
      type: 'screen-vision.noteworthy',
      description: {
        zh: '定时视觉检查发现可能值得提醒使用者的变化。',
        en: 'A scheduled vision check found a potentially noteworthy change.',
      },
      trigger: 'flush',
    }],
  },
};
