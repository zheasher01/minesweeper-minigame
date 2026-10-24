import type { CoreRecord } from '../../core/index.ts';
import { drawNavBar } from '../app.ts';
import type { App, Screen, Ui } from '../app.ts';
import { BoardView } from '../board.ts';
import { drawButton, drawText, fillRoundRect } from '../draw.ts';
import type { Ctx } from '../draw.ts';
import type { DragTarget } from '../gestures.ts';
import { drawPause, drawPlay, drawSkipBack } from '../icons.ts';
import { clamp, contains } from '../metrics.ts';
import type { Rect } from '../metrics.ts';
import { ReplaySession } from '../session.ts';

export class ReplayScreen implements Screen {
  readonly session: ReplaySession;
  readonly board = new BoardView();
  private readonly app: App;
  private boardVersion = -1;
  private track: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private readonly slider: DragTarget = {
    start: () => true,
    move: (_dx, _dy, x) => this.seekTo(x),
  };

  constructor(app: App, record: CoreRecord) {
    this.app = app;
    this.session = new ReplaySession(record, { timers: app.env.timers, onChange: () => app.invalidate() });
  }

  seekTo(x: number): void {
    const ratio = this.track.w > 0 ? clamp((x - this.track.x) / this.track.w, 0, 1) : 0;
    const step = Math.round(ratio * this.session.stepCount);
    if (step !== this.session.step || this.session.playing) {
      this.session.seek(step);
    }
  }

  dragTarget(x: number, y: number): DragTarget | null {
    const touch = { x: this.track.x - 12, y: this.track.y - 18, w: this.track.w + 24, h: this.track.h + 36 };
    if (contains(touch, x, y)) {
      return this.slider;
    }
    return contains(this.board.container, x, y) ? this.board.drag : null;
  }

  pause(): void {
    if (this.session.playing) {
      this.session.togglePlay();
    }
  }

  dispose(): void {
    this.session.dispose();
  }

  draw(ctx: Ctx, ui: Ui, now: number): boolean {
    const env = this.app.env;
    const c = ui.colors;
    const session = this.session;
    const top = drawNavBar(ctx, ui, env, ui.t('replayTitle'), { label: ui.t('close'), tap: () => this.app.pop() });
    const width = Math.min(env.width - 32, 520);
    const x = (env.width - width) / 2;

    const record = session.record;
    const info = ui.difficultyName(record.difficultyName) + ' · ' + ui.t(record.isWin ? 'win' : 'lose') +
      (record.seed !== null ? ' · #' + record.seed : '');
    drawText(ctx, info, env.width / 2, top + 10, { size: 13, color: c.secondaryLabel, align: 'center', maxWidth: width });

    const panelHeight = 128;
    const panelY = env.height - env.safeBottom - panelHeight - 12;
    this.board.setContainer({ x: 0, y: top + 26, w: env.width, h: Math.max(40, panelY - 8 - (top + 26)) });
    if (session.version !== this.boardVersion) {
      this.board.update(session.snapshot, now, session.animate);
      this.boardVersion = session.version;
    }
    const animating = this.board.draw(ctx, now, c, ui.skin, false);

    fillRoundRect(ctx, { x, y: panelY, w: width, h: panelHeight }, 18, c.card);
    drawText(ctx, ui.t('stepCount') + ': ' + session.step + ' / ' + session.stepCount, x + 16, panelY + 24, {
      size: 15,
      color: c.label,
      weight: 'bold',
      maxWidth: width - 32,
    });
    this.track = { x: x + 20, y: panelY + 50, w: width - 40, h: 6 };
    fillRoundRect(ctx, this.track, 3, c.fill);
    fillRoundRect(ctx, { x: this.track.x, y: this.track.y, w: this.track.w * session.progress, h: 6 }, 3, c.blue);
    ctx.beginPath();
    ctx.arc(this.track.x + this.track.w * session.progress, this.track.y + 3, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;
    ui.hit({
      rect: { x: this.track.x - 12, y: this.track.y - 18, w: this.track.w + 24, h: 42 },
      tap: (px) => this.seekTo(px),
    });

    const buttonY = panelY + 74;
    const third = (width - 48) / 3;
    const back = { x: x + 12, y: buttonY, w: third, h: 42 };
    const play = { x: x + 24 + third, y: buttonY, w: third, h: 42 };
    const speed = { x: x + 36 + third * 2, y: buttonY, w: third, h: 42 };
    fillRoundRect(ctx, back, 12, c.fill);
    drawSkipBack(ctx, back.x + back.w / 2, back.y + back.h / 2, 16, c.label);
    fillRoundRect(ctx, play, 12, c.blue);
    if (session.playing) {
      drawPause(ctx, play.x + play.w / 2, play.y + play.h / 2, 18, '#FFFFFF');
    } else {
      drawPlay(ctx, play.x + play.w / 2, play.y + play.h / 2, 18, '#FFFFFF');
    }
    drawButton(ctx, speed, ui.t('playbackSpeed') + ' ' + session.speed.toFixed(1) + 'x', c.fill, c.label, 14);
    ui.hit({ rect: back, tap: () => session.seek(0) });
    ui.hit({
      rect: play,
      tap: () => {
        this.app.haptic('light');
        session.togglePlay();
      },
    });
    ui.hit({ rect: speed, tap: () => session.cycleSpeed() });
    ui.hit({ rect: this.board.container, tap: () => undefined });
    return animating;
  }
}