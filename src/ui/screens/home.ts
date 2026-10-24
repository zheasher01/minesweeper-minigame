import { DIFFICULTIES } from '../../core/index.ts';
import type { DifficultyCode } from '../../core/index.ts';
import { DIFFICULTY_NAME_KEYS, ScrollState, drawBackdrop } from '../app.ts';
import type { App, Screen, Ui } from '../app.ts';
import { drawButton, drawText, fillRoundRect, strokeRoundRect, wrapText } from '../draw.ts';
import type { Ctx } from '../draw.ts';
import type { DragTarget } from '../gestures.ts';
import { PICKAXE_HANDLE, PICKAXE_HEAD, drawGear, drawHashBadge, drawPickaxe } from '../icons.ts';
import { DIFFICULTY_ICONS, parseSeedInput } from '../metrics.ts';
import type { Rect } from '../metrics.ts';
import { GameScreen } from './game.ts';
import { SettingsScreen } from './settings.ts';

export const HELL_HOLD_MS = 5000;
const SELECTABLE: readonly DifficultyCode[] = ['easy', 'medium', 'hard'];

export class HomeScreen implements Screen {
  selected: DifficultyCode = 'easy';
  seedText: string | null = null;
  private readonly app: App;
  private readonly scroll: ScrollState;
  private viewport: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(app: App) {
    this.app = app;
    this.scroll = new ScrollState(() => app.env.now());
  }

  start(difficulty: DifficultyCode, seed: number | null, godMode: boolean, nanagokyuu: boolean): void {
    this.app.push(new GameScreen(this.app, difficulty, seed, godMode, nanagokyuu));
  }

  openSeedDialog(): void {
    this.seedText = '';
    this.app.env.platform.showKeyboard('');
  }

  closeSeedDialog(): void {
    this.seedText = null;
    this.app.env.platform.hideKeyboard();
  }

  submitSeed(): void {
    if (this.seedText === null) {
      return;
    }
    const parsed = parseSeedInput(this.seedText);
    if (parsed.kind === 'invalid') {
      this.app.toast('invalidSeed');
      return;
    }
    this.closeSeedDialog();
    if (parsed.kind === 'godMode') {
      this.start(this.selected, null, true, false);
    } else if (parsed.kind === 'nanagokyuu') {
      this.start(this.selected, null, false, true);
    } else {
      this.start(this.selected, parsed.seed, false, false);
    }
  }

  keyboardInput(value: string): void {
    if (this.seedText !== null) {
      this.seedText = value;
    }
  }

  keyboardConfirm(value: string): void {
    if (this.seedText !== null) {
      this.seedText = value;
      this.submitSeed();
    }
  }

  dragTarget(): DragTarget | null {
    return this.seedText === null ? this.scroll : null;
  }

  draw(ctx: Ctx, ui: Ui, now: number): boolean {
    const app = this.app;
    const env = app.env;
    const c = ui.colors;

    const size = env.navHeight;
    ctx.beginPath();
    ctx.arc(16 + size / 2, env.navTop + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = c.card;
    ctx.fill();
    ctx.strokeStyle = c.separator;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    drawGear(ctx, 16 + size / 2, env.navTop + size / 2, size * 0.3, c.secondaryLabel, c.card);
    ui.hit({
      rect: { x: 4, y: env.navTop - 6, w: size + 24, h: size + 12 },
      tap: () => {
        app.haptic('light');
        app.push(new SettingsScreen(app));
      },
    });

    const viewTop = env.navTop + env.navHeight + 8;
    this.viewport = { x: 0, y: viewTop, w: env.width, h: env.height - viewTop };
    const clip = this.viewport;
    const animating = this.scroll.step(now);
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.w, clip.h);
    ctx.clip();

    const width = Math.min(env.width - 40, 480);
    const x = (env.width - width) / 2;
    let y = viewTop + 8 - this.scroll.offset;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 10;
    drawText(ctx, ui.skin.mainIcon, env.width / 2, y + 46, { size: 72, color: c.label, align: 'center' });
    ctx.restore();
    ui.hit({
      rect: { x: env.width / 2 - 55, y, w: 110, h: 96 },
      clip,
      longPressMs: HELL_HOLD_MS,
      longPress: () => {
        app.haptic('heavy');
        this.start('hell', null, false, false);
      },
    });
    y += 100;
    drawText(ctx, ui.t('gameTitle'), env.width / 2, y + 16, {
      size: 28,
      color: c.label,
      weight: 'bold',
      align: 'center',
      maxWidth: width,
    });
    y += 52;

    const buttonHeight = 64;
    const cardHeight = 16 + 22 + SELECTABLE.length * (buttonHeight + 10) + 6;
    fillRoundRect(ctx, { x, y, w: width, h: cardHeight }, 20, c.card);
    drawText(ctx, ui.t('selectDifficulty'), x + 16, y + 26, { size: 15, color: c.secondaryLabel, weight: 'bold' });
    let by = y + 48;
    for (const code of SELECTABLE) {
      const spec = DIFFICULTIES[code];
      const rect = { x: x + 12, y: by, w: width - 24, h: buttonHeight };
      const selected = this.selected === code;
      fillRoundRect(ctx, rect, 14, selected ? c.selectedTint : c.panel);
      if (selected) {
        strokeRoundRect(ctx, rect, 14, c.blue, 2);
      }
      drawText(ctx, DIFFICULTY_ICONS[code], rect.x + 30, rect.y + buttonHeight / 2, { size: 28, color: c.label, align: 'center' });
      drawText(ctx, ui.t(DIFFICULTY_NAME_KEYS[code]), rect.x + 58, rect.y + 23, {
        size: 17,
        color: c.label,
        weight: 'bold',
        maxWidth: rect.w - 100,
      });
      drawText(ctx, spec.rows + '×' + spec.cols + ' · ' + spec.mines + ui.t('minesSuffix'), rect.x + 58, rect.y + 44, {
        size: 13,
        color: c.secondaryLabel,
        maxWidth: rect.w - 100,
      });
      if (selected) {
        drawText(ctx, '✓', rect.x + rect.w - 20, rect.y + buttonHeight / 2, {
          size: 20,
          color: c.blue,
          weight: 'bold',
          align: 'center',
        });
      }
      ui.hit({
        rect,
        clip,
        tap: () => {
          if (this.selected !== code) {
            app.haptic('light');
            this.selected = code;
          }
        },
      });
      by += buttonHeight + 10;
    }
    y += cardHeight + 16;

    const rules: [(cx: number, cy: number) => void, string][] = [
      [(cx, cy) => drawPickaxe(ctx, cx, cy, 20, PICKAXE_HEAD, PICKAXE_HANDLE), ui.t('ruleDig')],
      [(cx, cy) => drawText(ctx, '🚩', cx, cy, { size: 18, color: c.label, align: 'center' }), ui.t('ruleFlag')],
      [(cx, cy) => drawHashBadge(ctx, cx, cy, 20, c.blue), ui.t('ruleSeed')],
    ];
    const ruleLines = rules.map(([, text]) => wrapText(ctx, text, width - 72, 14));
    const rulesHeight = 16 + ruleLines.reduce((sum, lines) => sum + Math.max(1, lines.length) * 19 + 12, 0) + 4;
    fillRoundRect(ctx, { x, y, w: width, h: rulesHeight }, 20, c.card);
    let ry = y + 16;
    rules.forEach(([icon], index) => {
      const lines = ruleLines[index];
      icon(x + 30, ry + 10);
      lines.forEach((line, lineIndex) => {
        drawText(ctx, line, x + 54, ry + 10 + lineIndex * 19, { size: 14, color: c.secondaryLabel });
      });
      ry += Math.max(1, lines.length) * 19 + 12;
    });
    y += rulesHeight + 20;

    const linkText = '# ' + ui.t('customSeedChallenge');
    const linkWidth = drawText(ctx, linkText, env.width / 2, y + 14, {
      size: 14,
      color: c.blue,
      weight: 'bold',
      align: 'center',
      maxWidth: width,
    });
    ui.hit({
      rect: { x: env.width / 2 - linkWidth / 2 - 12, y: y - 4, w: linkWidth + 24, h: 36 },
      clip,
      tap: () => {
        app.haptic('light');
        this.openSeedDialog();
      },
    });
    y += 44;

    const startRect = { x, y, w: width, h: 54 };
    drawButton(ctx, startRect, ui.t('startGame'), c.blue, '#FFFFFF', 18, 16);
    ui.hit({
      rect: startRect,
      clip,
      tap: () => {
        app.haptic('light');
        this.start(this.selected, null, false, false);
      },
    });
    y += 54 + 24 + env.safeBottom;

    ctx.restore();
    this.scroll.layout(this.viewport, y + this.scroll.offset - viewTop);

    if (this.seedText !== null) {
      this.drawSeedDialog(ctx, ui);
    }
    return animating;
  }

  private drawSeedDialog(ctx: Ctx, ui: Ui): void {
    const env = this.app.env;
    const c = ui.colors;
    drawBackdrop(ctx, ui, env);
    const width = Math.min(320, env.width - 48);
    const messageLines = wrapText(ctx, ui.t('inputSeedMessage'), width - 40, 13);
    const height = 20 + 24 + 8 + messageLines.length * 18 + 16 + 44 + 20 + 44 + 20;
    const x = (env.width - width) / 2;
    const y = Math.max(env.navTop + env.navHeight, env.height * 0.3 - height / 2);
    fillRoundRect(ctx, { x, y, w: width, h: height }, 18, c.card);
    let cy = y + 32;
    drawText(ctx, ui.t('inputSeedTitle'), x + width / 2, cy, {
      size: 17,
      color: c.label,
      weight: 'bold',
      align: 'center',
      maxWidth: width - 32,
    });
    cy += 24;
    messageLines.forEach((line) => {
      drawText(ctx, line, x + width / 2, cy, { size: 13, color: c.secondaryLabel, align: 'center' });
      cy += 18;
    });
    cy += 8;
    const field = { x: x + 20, y: cy, w: width - 40, h: 44 };
    fillRoundRect(ctx, field, 10, c.fill);
    const text = this.seedText ?? '';
    drawText(ctx, text === '' ? ui.t('inputSeedPlaceholder') : text, field.x + 12, field.y + 22, {
      size: 16,
      color: text === '' ? c.tertiaryLabel : c.label,
      maxWidth: field.w - 24,
    });
    ui.hit({ rect: field, tap: () => this.app.env.platform.showKeyboard(this.seedText ?? '') });
    cy += 44 + 20;
    const half = (width - 52) / 2;
    const cancel = { x: x + 20, y: cy, w: half, h: 44 };
    const confirm = { x: x + 32 + half, y: cy, w: half, h: 44 };
    drawButton(ctx, cancel, ui.t('cancel'), c.fill, c.label, 16);
    drawButton(ctx, confirm, ui.t('inputSeed'), c.blue, '#FFFFFF', 16);
    ui.hit({ rect: cancel, tap: () => this.closeSeedDialog() });
    ui.hit({ rect: confirm, tap: () => this.submitSeed() });
  }
}