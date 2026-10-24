import type { DifficultyCode, HapticKind } from '../core/index.ts';
import type { Platform } from '../platform/types.ts';
import { SWITCH_HEIGHT, SWITCH_WIDTH, drawChevron, drawSwitch, drawText, fillRoundRect, measureText, wrapText } from './draw.ts';
import type { Ctx } from './draw.ts';
import { GestureTracker } from './gestures.ts';
import type { DragTarget, GestureHandler, Timers } from './gestures.ts';
import { translate } from './i18n.ts';
import type { TextKey } from './i18n.ts';
import { clamp, contains, difficultyFromName } from './metrics.ts';
import type { Point, Rect } from './metrics.ts';
import type { HistoryStore } from './session.ts';
import type { Settings } from './settings.ts';
import { DARK_COLORS, LIGHT_COLORS, SKINS } from './theme.ts';
import type { AppColors, Skin } from './theme.ts';

export const APP_VERSION = '1.0.0';
export const DEFAULT_LONG_PRESS_MS = 500;

export const DIFFICULTY_NAME_KEYS: Readonly<Record<DifficultyCode, TextKey>> = {
  easy: 'difficultyEasy',
  medium: 'difficultyMedium',
  hard: 'difficultyHard',
  hell: 'difficultyHell',
};

export interface AppEnv {
  readonly platform: Platform;
  readonly settings: Settings;
  readonly history: HistoryStore;
  readonly timers: Timers;
  readonly width: number;
  readonly height: number;
  readonly safeBottom: number;
  readonly pixelScale: number;
  readonly navTop: number;
  readonly navHeight: number;
  now(): number;
  requestFrame(callback: () => void): void;
}

export interface Hit {
  readonly rect: Rect;
  readonly clip?: Rect;
  readonly tap?: (x: number, y: number) => void;
  readonly longPress?: (x: number, y: number) => void;
  readonly longPressMs?: number;
}

export interface Screen {
  draw(ctx: Ctx, ui: Ui, now: number): boolean;
  dragTarget?(x: number, y: number): DragTarget | null;
  keyboardInput?(value: string): void;
  keyboardConfirm?(value: string): void;
  pause?(): void;
  resume?(): void;
  dispose?(): void;
}

export class Ui {
  hits: Hit[] = [];
  colors: AppColors = LIGHT_COLORS;
  skin: Skin = SKINS.Classic;
  private readonly settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  t(key: TextKey): string {
    return translate(this.settings.language, key);
  }

  difficultyName(name: string): string {
    const code = difficultyFromName(name);
    return code === null ? name : this.t(DIFFICULTY_NAME_KEYS[code]);
  }

  hit(hit: Hit): void {
    this.hits.push(hit);
  }

  find(x: number, y: number): Hit | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const hit = this.hits[i];
      if (contains(hit.rect, x, y) && (hit.clip === undefined || contains(hit.clip, x, y))) {
        return hit;
      }
    }
    return null;
  }
}

// Screen stack, render loop and gesture routing. Everything is drawn on one
// canvas; screens register hit areas while drawing.
export class App implements GestureHandler {
  readonly env: AppEnv;
  readonly ui: Ui;
  readonly tracker: GestureTracker;
  private readonly ctx: Ctx;
  private readonly stack: Screen[] = [];
  private scheduled = false;
  private active: DragTarget | null = null;
  private systemDark: boolean;

  constructor(env: AppEnv, ctx: Ctx) {
    this.env = env;
    this.ctx = ctx;
    this.ui = new Ui(env.settings);
    this.tracker = new GestureTracker(() => this, env.timers);
    this.systemDark = env.platform.systemTheme() === 'dark';
    env.platform.onHide(() => {
      this.tracker.cancel();
      this.top?.pause?.();
    });
    env.platform.onShow(() => {
      this.top?.resume?.();
      this.invalidate();
    });
    env.platform.onThemeChange(() => {
      this.systemDark = env.platform.systemTheme() === 'dark';
      this.invalidate();
    });
    env.platform.onKeyboard({
      input: (value) => {
        this.top?.keyboardInput?.(value);
        this.invalidate();
      },
      confirm: (value) => {
        this.top?.keyboardConfirm?.(value);
        this.invalidate();
      },
      complete: () => this.invalidate(),
    });
  }

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length;
  }

  t(key: TextKey): string {
    return this.ui.t(key);
  }

  push(screen: Screen): void {
    this.tracker.cancel();
    this.ui.hits = [];
    this.stack.push(screen);
    this.invalidate();
  }

  pop(): void {
    if (this.stack.length <= 1) {
      return;
    }
    this.tracker.cancel();
    this.ui.hits = [];
    this.stack.pop()?.dispose?.();
    this.invalidate();
  }

  haptic(kind: HapticKind): void {
    if (this.env.settings.haptics) {
      this.env.platform.haptic(kind);
    }
  }

  toast(key: TextKey): void {
    this.env.platform.showToast(this.t(key));
  }

  invalidate(): void {
    if (this.scheduled) {
      return;
    }
    this.scheduled = true;
    this.env.requestFrame(() => {
      this.scheduled = false;
      this.render();
    });
  }

  render(): void {
    const settings = this.env.settings;
    const dark = settings.appearance === 'dark' || (settings.appearance === 'system' && this.systemDark);
    this.ui.colors = dark ? DARK_COLORS : LIGHT_COLORS;
    this.ui.skin = SKINS[settings.theme];
    this.ui.hits = [];
    const screen = this.top;
    const ctx = this.ctx;
    ctx.setTransform(this.env.pixelScale, 0, 0, this.env.pixelScale, 0, 0);
    ctx.save();
    ctx.clearRect(0, 0, this.env.width, this.env.height);
    ctx.fillStyle = this.ui.colors.grouped;
    ctx.fillRect(0, 0, this.env.width, this.env.height);
    const animating = screen !== undefined && screen.draw(ctx, this.ui, this.env.now());
    ctx.restore();
    if (animating) {
      this.invalidate();
    }
  }

  longPressMs(x: number, y: number): number | null {
    const hit = this.ui.find(x, y);
    return hit?.longPress !== undefined ? hit.longPressMs ?? DEFAULT_LONG_PRESS_MS : null;
  }

  tap(x: number, y: number): void {
    this.ui.find(x, y)?.tap?.(x, y);
    this.invalidate();
  }

  longPress(x: number, y: number): void {
    this.ui.find(x, y)?.longPress?.(x, y);
    this.invalidate();
  }

  dragStart(x: number, y: number): boolean {
    const target = this.top?.dragTarget?.(x, y) ?? null;
    if (target !== null && target.start(x, y)) {
      this.active = target;
      return true;
    }
    return false;
  }

  drag(dx: number, dy: number, x: number, y: number): void {
    this.active?.move(dx, dy, x, y);
    this.invalidate();
  }

  dragEnd(): void {
    this.active?.end?.();
    this.active = null;
    this.invalidate();
  }

  pinchStart(centroid: Point, distance: number): boolean {
    const target = this.top?.dragTarget?.(centroid.x, centroid.y) ?? null;
    if (target?.pinchStart !== undefined && target.pinchStart(centroid, distance)) {
      this.active = target;
      return true;
    }
    return false;
  }

  pinch(centroid: Point, ratio: number): void {
    this.active?.pinch?.(centroid, ratio);
    this.invalidate();
  }

  pinchEnd(): void {
    this.active?.pinchEnd?.();
    this.active = null;
    this.invalidate();
  }
}

// Vertical scrolling with a short fling.
export class ScrollState implements DragTarget {
  offset = 0;
  private viewport: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private contentHeight = 0;
  private velocity = 0;
  private lastMoveAt = 0;
  private flingAt = 0;
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  get maxOffset(): number {
    return Math.max(0, this.contentHeight - this.viewport.h);
  }

  layout(viewport: Rect, contentHeight: number): void {
    this.viewport = viewport;
    this.contentHeight = contentHeight;
    this.offset = clamp(this.offset, 0, this.maxOffset);
  }

  start(x: number, y: number): boolean {
    if (!contains(this.viewport, x, y) || this.maxOffset <= 0) {
      return false;
    }
    this.velocity = 0;
    this.lastMoveAt = this.now();
    return true;
  }

  move(_dx: number, dy: number): void {
    const time = this.now();
    const dt = Math.max(1, time - this.lastMoveAt);
    this.velocity = 0.8 * (-dy / dt) + 0.2 * this.velocity;
    this.lastMoveAt = time;
    this.offset = clamp(this.offset - dy, 0, this.maxOffset);
  }

  end(): void {
    const time = this.now();
    if (time - this.lastMoveAt > 80) {
      this.velocity = 0;
    }
    this.flingAt = time;
  }

  step(now: number): boolean {
    if (this.velocity === 0) {
      return false;
    }
    const dt = Math.max(0, now - this.flingAt);
    this.flingAt = now;
    this.offset += this.velocity * dt;
    this.velocity *= Math.pow(0.995, dt);
    const max = this.maxOffset;
    if (Math.abs(this.velocity) < 0.02 || this.offset <= 0 || this.offset >= max) {
      this.velocity = 0;
      this.offset = clamp(this.offset, 0, max);
      return false;
    }
    return true;
  }
}

export interface NavAction {
  readonly label: string;
  readonly tap: () => void;
}

// Returns the y coordinate where content starts. The right side stays empty
// for the WeChat capsule button.
export function drawNavBar(ctx: Ctx, ui: Ui, env: AppEnv, title: string, left: NavAction | null): number {
  const y = env.navTop;
  const h = env.navHeight;
  drawText(ctx, title, env.width / 2, y + h / 2, {
    size: 17,
    color: ui.colors.label,
    weight: 'bold',
    align: 'center',
    maxWidth: env.width - 220,
  });
  if (left !== null) {
    const width = measureText(ctx, left.label, 17);
    drawText(ctx, left.label, 16, y + h / 2, { size: 17, color: ui.colors.blue, maxWidth: 96 });
    ui.hit({ rect: { x: 0, y: y - 8, w: Math.min(width, 96) + 32, h: h + 16 }, tap: left.tap });
  }
  return y + h + 10;
}

export function drawBackdrop(ctx: Ctx, ui: Ui, env: AppEnv): void {
  ctx.fillStyle = ui.colors.dim;
  ctx.fillRect(0, 0, env.width, env.height);
  ui.hit({ rect: { x: 0, y: 0, w: env.width, h: env.height }, tap: () => undefined });
}

export interface Row {
  readonly title: string;
  readonly subtitle?: string;
  readonly value?: string;
  readonly chevron?: boolean;
  readonly toggle?: boolean;
  readonly check?: boolean;
  readonly destructive?: boolean;
  readonly tap?: () => void;
}

export function drawSection(
  ctx: Ctx,
  ui: Ui,
  x: number,
  y: number,
  width: number,
  header: string | null,
  rows: readonly Row[],
  clip: Rect,
): number {
  const c = ui.colors;
  let top = y;
  if (header !== null) {
    drawText(ctx, header, x + 16, top + 10, { size: 13, color: c.secondaryLabel, maxWidth: width - 32 });
    top += 26;
  }
  const layouts = rows.map((row) => {
    const reserved = row.toggle !== undefined ? SWITCH_WIDTH + 16 : 0;
    const lines = row.subtitle === undefined ? [] : wrapText(ctx, row.subtitle, width - 32 - reserved, 12);
    return { row, lines, height: lines.length > 0 ? 40 + lines.length * 16 : 48 };
  });
  const total = layouts.reduce((sum, item) => sum + item.height, 0);
  fillRoundRect(ctx, { x, y: top, w: width, h: total }, 12, c.card);
  let rowY = top;
  layouts.forEach((item, index) => {
    const { row, lines, height } = item;
    if (index > 0) {
      ctx.fillStyle = c.separator;
      ctx.fillRect(x + 16, rowY, width - 16, 0.5);
    }
    const titleY = lines.length > 0 ? rowY + 20 : rowY + height / 2;
    let right = x + width - 16;
    if (row.toggle !== undefined) {
      drawSwitch(ctx, right - SWITCH_WIDTH, rowY + (height - SWITCH_HEIGHT) / 2, row.toggle, c);
      right -= SWITCH_WIDTH + 12;
    }
    if (row.chevron === true) {
      drawChevron(ctx, right - 3, titleY, c.tertiaryLabel);
      right -= 18;
    }
    if (row.check === true) {
      drawText(ctx, '✓', right, titleY, { size: 18, color: c.blue, weight: 'bold', align: 'right' });
      right -= 24;
    }
    let valueWidth = 0;
    if (row.value !== undefined) {
      valueWidth = drawText(ctx, row.value, right, titleY, {
        size: 16,
        color: c.secondaryLabel,
        align: 'right',
        maxWidth: width * 0.45,
      });
    }
    drawText(ctx, row.title, x + 16, titleY, {
      size: 16,
      color: row.destructive === true ? c.red : c.label,
      maxWidth: Math.max(40, right - valueWidth - 12 - (x + 16)),
    });
    lines.forEach((line, lineIndex) => {
      drawText(ctx, line, x + 16, rowY + 40 + lineIndex * 16, { size: 12, color: c.secondaryLabel });
    });
    if (row.tap !== undefined) {
      ui.hit({ rect: { x, y: rowY, w: width, h: height }, clip, tap: row.tap });
    }
    rowY += height;
  });
  return top + total + 22;
}