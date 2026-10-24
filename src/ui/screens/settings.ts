import { APP_VERSION, ScrollState, drawNavBar, drawSection } from '../app.ts';
import type { App, Row, Screen, Ui } from '../app.ts';
import type { Ctx } from '../draw.ts';
import type { DragTarget } from '../gestures.ts';
import { LANGUAGES } from '../i18n.ts';
import type { TextKey } from '../i18n.ts';
import type { Rect } from '../metrics.ts';
import type { AppearanceMode } from '../settings.ts';
import type { ThemeName } from '../theme.ts';
import { HistoryScreen } from './history.ts';

const APPEARANCE_KEYS: Readonly<Record<AppearanceMode, TextKey>> = {
  system: 'appearanceSystem',
  light: 'appearanceLight',
  dark: 'appearanceDark',
};
const APPEARANCES: readonly AppearanceMode[] = ['system', 'light', 'dark'];
const THEMES: readonly ThemeName[] = ['Classic', 'Flower'];
const THEME_KEYS: Readonly<Record<ThemeName, TextKey>> = { Classic: 'themeClassic', Flower: 'themeFlower' };

abstract class ScrollingScreen implements Screen {
  protected readonly app: App;
  protected readonly scroll: ScrollState;

  constructor(app: App) {
    this.app = app;
    this.scroll = new ScrollState(() => app.env.now());
  }

  dragTarget(): DragTarget | null {
    return this.scroll;
  }

  protected abstract title(ui: Ui): string;
  protected abstract content(ctx: Ctx, ui: Ui, x: number, y: number, width: number, clip: Rect): number;

  draw(ctx: Ctx, ui: Ui, now: number): boolean {
    const env = this.app.env;
    const top = drawNavBar(ctx, ui, env, this.title(ui), { label: ui.t('close'), tap: () => this.app.pop() });
    const viewport = { x: 0, y: top, w: env.width, h: env.height - top };
    const animating = this.scroll.step(now);
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
    ctx.clip();
    const width = Math.min(env.width - 32, 560);
    const x = (env.width - width) / 2;
    const start = top + 6 - this.scroll.offset;
    const end = this.content(ctx, ui, x, start, width, viewport);
    ctx.restore();
    this.scroll.layout(viewport, end - start + env.safeBottom + 16);
    return animating;
  }
}

export class SettingsScreen extends ScrollingScreen {
  protected title(ui: Ui): string {
    return ui.t('settings');
  }

  chooseAppearance(): void {
    const app = this.app;
    app.env.platform.showActionSheet(APPEARANCES.map((mode) => app.t(APPEARANCE_KEYS[mode]))).then((index) => {
      if (index !== null && APPEARANCES[index] !== undefined) {
        app.env.settings.appearance = APPEARANCES[index];
        app.invalidate();
      }
    });
  }

  chooseTheme(): void {
    const app = this.app;
    app.env.platform.showActionSheet(THEMES.map((theme) => app.t(THEME_KEYS[theme]))).then((index) => {
      if (index !== null && THEMES[index] !== undefined) {
        app.env.settings.theme = THEMES[index];
        app.invalidate();
      }
    });
  }

  clearHistory(): void {
    const app = this.app;
    app.env.platform
      .confirm({
        title: app.t('clearAll'),
        content: app.t('clearHistoryConfirm'),
        confirmText: app.t('delete'),
        cancelText: app.t('cancel'),
        destructive: true,
      })
      .then((confirmed) => {
        if (confirmed) {
          app.env.history.clear();
          app.invalidate();
        }
      });
  }

  protected content(ctx: Ctx, ui: Ui, x: number, y: number, width: number, clip: Rect): number {
    const app = this.app;
    const settings = app.env.settings;
    const language = LANGUAGES.find((item) => item.code === settings.language);
    const general: Row[] = [
      {
        title: ui.t('language'),
        value: language === undefined ? '' : language.flag + ' ' + language.name,
        chevron: true,
        tap: () => app.push(new LanguageScreen(app)),
      },
      {
        title: ui.t('appearance'),
        value: ui.t(APPEARANCE_KEYS[settings.appearance]),
        chevron: true,
        tap: () => this.chooseAppearance(),
      },
    ];
    const gameplay: Row[] = [
      { title: ui.t('theme'), value: ui.t(THEME_KEYS[settings.theme]), chevron: true, tap: () => this.chooseTheme() },
      {
        title: ui.t('haptics'),
        subtitle: ui.t('hapticsDesc'),
        toggle: settings.haptics,
        tap: () => {
          settings.haptics = !settings.haptics;
          app.haptic('light');
        },
      },
      {
        title: ui.t('noGuessingOption'),
        subtitle: ui.t('noGuessingDesc'),
        toggle: settings.noGuessing,
        tap: () => {
          settings.noGuessing = !settings.noGuessing;
          app.haptic('light');
        },
      },
    ];
    const data: Row[] = [
      { title: ui.t('historyTitle'), chevron: true, tap: () => app.push(new HistoryScreen(app)) },
      { title: ui.t('clearAll'), destructive: true, tap: () => this.clearHistory() },
    ];
    const about: Row[] = [{ title: ui.t('version'), value: APP_VERSION }];
    let cy = drawSection(ctx, ui, x, y, width, ui.t('general'), general, clip);
    cy = drawSection(ctx, ui, x, cy, width, ui.t('gameplay'), gameplay, clip);
    cy = drawSection(ctx, ui, x, cy, width, ui.t('dataManagement'), data, clip);
    return drawSection(ctx, ui, x, cy, width, ui.t('about'), about, clip);
  }
}

export class LanguageScreen extends ScrollingScreen {
  protected title(ui: Ui): string {
    return ui.t('language');
  }

  protected content(ctx: Ctx, ui: Ui, x: number, y: number, width: number, clip: Rect): number {
    const settings = this.app.env.settings;
    const rows: Row[] = LANGUAGES.map((language) => ({
      title: language.flag + '  ' + language.name,
      check: settings.language === language.code,
      tap: () => {
        if (settings.language !== language.code) {
          settings.language = language.code;
          this.app.haptic('light');
        }
      },
    }));
    return drawSection(ctx, ui, x, y, width, null, rows, clip);
  }
}