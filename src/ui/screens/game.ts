import { FLAG_FLAGGED, FLAG_REVEALED } from '../../core/index.ts';
import type { DifficultyCode } from '../../core/index.ts';
import { DIFFICULTY_NAME_KEYS, drawBackdrop, drawNavBar } from '../app.ts';
import type { App, Screen, Ui } from '../app.ts';
import { BoardView } from '../board.ts';
import { drawButton, drawText, fillRoundRect, measureText } from '../draw.ts';
import type { Ctx } from '../draw.ts';
import type { DragTarget } from '../gestures.ts';
import { drawIconLabel, drawPickaxe, drawStopwatch } from '../icons.ts';
import { contains, formatClock } from '../metrics.ts';
import { GameSession } from '../session.ts';

export const CELL_LONG_PRESS_MS = 250;
export type InputMode = 'dig' | 'flag';

export class GameScreen implements Screen {
  readonly session: GameSession;
  readonly board = new BoardView();
  mode: InputMode = 'dig';
  private readonly app: App;
  private boardVersion = -1;

  constructor(app: App, difficulty: DifficultyCode, seed: number | null, godMode: boolean, nanagokyuu: boolean) {
    this.app = app;
    const env = app.env;
    this.session = new GameSession(
      {
        timers: env.timers,
        history: env.history,
        now: () => env.now(),
        haptic: (kind) => app.haptic(kind),
        batteryPercent: () => env.platform.batteryPercent(),
        noGuessing: () => env.settings.noGuessing,
        onChange: () => app.invalidate(),
      },
      difficulty,
      seed,
      godMode,
      nanagokyuu,
    );
  }

  tapCell(index: number): void {
    const session = this.session;
    if (!session.interactive) {
      return;
    }
    const bits = session.snapshot.cellFlags[index];
    if ((bits & FLAG_REVEALED) !== 0) {
      session.chord(index);
    } else if (this.mode === 'flag') {
      session.toggleFlag(index);
    } else if ((bits & FLAG_FLAGGED) !== 0) {
      this.app.haptic('light');
    } else {
      session.reveal(index);
    }
  }

  longPressCell(index: number): void {
    const session = this.session;
    if (!session.interactive || (session.snapshot.cellFlags[index] & FLAG_REVEALED) !== 0) {
      return;
    }
    if (this.mode === 'dig') {
      session.toggleFlag(index);
    }
  }

  newGame(): void {
    this.app.haptic('light');
    this.session.startNewGame();
  }

  copySeed(): void {
    const seed = String(this.session.snapshot.seed);
    this.app.env.platform.copyText(seed).then(
      () => this.app.toast('seedCopied'),
      (error: unknown) => console.warn('copy seed failed', error),
    );
  }

  dragTarget(x: number, y: number): DragTarget | null {
    return !this.session.showResult && contains(this.board.container, x, y) ? this.board.drag : null;
  }

  pause(): void {
    this.session.pause();
  }

  resume(): void {
    this.session.resume();
  }

  dispose(): void {
    this.session.dispose();
  }

  draw(ctx: Ctx, ui: Ui, now: number): boolean {
    const env = this.app.env;
    const c = ui.colors;
    const session = this.session;
    drawNavBar(ctx, ui, env, ui.t(DIFFICULTY_NAME_KEYS[session.difficulty]), null);

    const width = Math.min(env.width - 32, 520);
    const x = (env.width - width) / 2;
    let y = env.navTop + env.navHeight + 10;

    const pillWidth = Math.min(120, (width - 84) / 2);
    const left = { x, y: y + 8, w: pillWidth, h: 44 };
    const right = { x: x + width - pillWidth, y: y + 8, w: pillWidth, h: 44 };
    fillRoundRect(ctx, left, 14, c.card);
    fillRoundRect(ctx, right, 14, c.card);
    drawText(ctx, ui.skin.mineIcon + ' ' + session.remainingMines, left.x + left.w / 2, left.y + 22, {
      size: 18,
      color: c.red,
      weight: 'bold',
      align: 'center',
      maxWidth: left.w - 12,
    });
    drawIconLabel(
      ctx,
      (cx, cy, s) => drawStopwatch(ctx, cx, cy, s, c.label),
      formatClock(session.elapsed),
      right.x + right.w / 2,
      right.y + 22,
      18,
      c.label,
      'bold',
      right.w - 12,
    );
    ctx.save();
    ctx.shadowColor = c.isDark ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(env.width / 2, y + 30, 28, 0, Math.PI * 2);
    ctx.fillStyle = c.card;
    ctx.fill();
    ctx.restore();
    drawText(ctx, session.resetIcon, env.width / 2, y + 31, { size: 30, color: c.label, align: 'center' });
    ui.hit({
      rect: { x: env.width / 2 - 34, y: y - 4, w: 68, h: 68 },
      tap: () => this.newGame(),
      longPress: () => this.newGame(),
    });
    y += 66;

    const seedText = ui.t('seed') + ': ' + session.snapshot.seed + '  📋';
    const seedWidth = Math.min(width, measureText(ctx, seedText, 13) + 28);
    const seedRect = { x: (env.width - seedWidth) / 2, y, w: seedWidth, h: 28 };
    fillRoundRect(ctx, seedRect, 14, c.fill);
    drawText(ctx, seedText, env.width / 2, y + 14, {
      size: 13,
      color: c.secondaryLabel,
      align: 'center',
      maxWidth: seedWidth - 16,
    });
    ui.hit({ rect: { x: seedRect.x - 8, y: y - 6, w: seedRect.w + 16, h: 40 }, tap: () => this.copySeed() });
    y += 38;

    const barHeight = 52;
    const barY = env.height - env.safeBottom - barHeight - 12;
    this.board.setContainer({ x: 0, y, w: env.width, h: Math.max(40, barY - 8 - y) });
    if (session.version !== this.boardVersion) {
      this.board.update(session.snapshot, session.appliedAt, session.animate);
      this.boardVersion = session.version;
    }
    this.board.setExplosions(session.explosions);
    const animating = this.board.draw(ctx, now, c, ui.skin, session.godMode);
    ui.hit({
      rect: this.board.container,
      tap: (px, py) => {
        const index = this.board.hitIndex(px, py);
        if (index !== null) {
          this.tapCell(index);
        }
      },
      longPressMs: CELL_LONG_PRESS_MS,
      longPress: (px, py) => {
        const index = this.board.hitIndex(px, py);
        if (index !== null) {
          this.longPressCell(index);
        }
      },
    });

    const segmentWidth = width - 110;
    const segment = { x, y: barY, w: segmentWidth, h: barHeight };
    fillRoundRect(ctx, segment, 14, c.card);
    const modes: [InputMode, string][] = [
      ['dig', ui.t('modeDigging')],
      ['flag', ui.t('modeFlagging')],
    ];
    modes.forEach(([mode, label], index) => {
      const rect = { x: x + 4 + index * (segmentWidth - 8) / 2, y: barY + 4, w: (segmentWidth - 8) / 2, h: barHeight - 8 };
      const selected = this.mode === mode;
      if (selected) {
        fillRoundRect(ctx, rect, 11, mode === 'dig' ? c.blue : c.orange);
      }
      const fg = selected ? '#FFFFFF' : c.label;
      drawIconLabel(
        ctx,
        mode === 'dig'
          ? (cx, cy, s) => drawPickaxe(ctx, cx, cy, s, fg, fg)
          : (cx, cy, s) => drawText(ctx, '🚩', cx, cy, { size: s * 0.85, color: fg, align: 'center' }),
        label,
        rect.x + rect.w / 2,
        rect.y + rect.h / 2,
        15,
        fg,
        'bold',
        rect.w - 8,
      );
      ui.hit({
        rect,
        tap: () => {
          if (this.mode !== mode) {
            this.app.haptic('light');
            this.mode = mode;
          }
        },
      });
    });
    const exitRect = { x: x + segmentWidth + 10, y: barY, w: width - segmentWidth - 10, h: barHeight };
    const exploding = session.status === 'exploding';
    fillRoundRect(ctx, exitRect, 14, c.card);
    drawText(ctx, ui.t('exitGame'), exitRect.x + exitRect.w / 2, barY + barHeight / 2, {
      size: 15,
      color: exploding ? c.tertiaryLabel : c.red,
      weight: 'bold',
      align: 'center',
      maxWidth: exitRect.w - 10,
    });
    if (!exploding) {
      ui.hit({ rect: exitRect, tap: () => this.app.pop() });
    }

    if (session.showResult) {
      this.drawResult(ctx, ui);
    }
    return animating;
  }

  private drawResult(ctx: Ctx, ui: Ui): void {
    const env = this.app.env;
    const c = ui.colors;
    const session = this.session;
    const win = session.status === 'won';
    drawBackdrop(ctx, ui, env);
    const width = Math.min(320, env.width - 48);
    const height = 326;
    const x = (env.width - width) / 2;
    const y = (env.height - height) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 30;
    fillRoundRect(ctx, { x, y, w: width, h: height }, 25, c.card);
    ctx.restore();
    drawText(ctx, win ? '🏆' : '⛔', x + width / 2, y + 60, { size: 54, color: win ? c.yellow : c.red, align: 'center' });
    drawText(ctx, ui.t(win ? 'congratulations' : 'gameOver'), x + width / 2, y + 123, {
      size: 28,
      color: win ? c.green : c.red,
      weight: 'bold',
      align: 'center',
      maxWidth: width - 32,
    });
    if (win) {
      drawText(ctx, ui.t('timeElapsed') + ': ' + formatClock(session.elapsed), x + width / 2, y + 155, {
        size: 17,
        color: c.secondaryLabel,
        weight: 'bold',
        align: 'center',
      });
    } else {
      drawText(ctx, ui.t('betterLuckNextTime'), x + width / 2, y + 155, { size: 13, color: c.gray, align: 'center' });
    }
    const half = (width - 63) / 2;
    const retry = { x: x + 24, y: y + 190, w: half, h: 48 };
    const exit = { x: x + 39 + half, y: y + 190, w: half, h: 48 };
    const review = { x: x + 24, y: y + 250, w: width - 48, h: 48 };
    drawButton(ctx, retry, ui.t('playAgain'), c.blue, '#FFFFFF', 16);
    drawButton(ctx, exit, ui.t('exit'), c.fill, c.label, 16);
    drawButton(ctx, review, ui.t('reviewBoard'), c.fill, c.blue, 16);
    ui.hit({ rect: retry, tap: () => this.newGame() });
    ui.hit({
      rect: exit,
      tap: () => {
        this.app.haptic('light');
        this.app.pop();
      },
    });
    ui.hit({
      rect: review,
      tap: () => {
        this.app.haptic('light');
        session.dismissResult();
      },
    });
  }
}