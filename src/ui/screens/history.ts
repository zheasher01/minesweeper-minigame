import type { CoreRecord } from '../../core/index.ts';
import { ScrollState, drawNavBar } from '../app.ts';
import type { App, Screen, Ui } from '../app.ts';
import { drawText, fillRoundRect } from '../draw.ts';
import type { Ctx } from '../draw.ts';
import type { DragTarget } from '../gestures.ts';
import { DIFFICULTY_ICONS, difficultyFromName, formatHistoryDate, isReplayable } from '../metrics.ts';
import { ReplayScreen } from './replay.ts';

const ROW_HEIGHT = 72;
const ROW_GAP = 10;

export class HistoryScreen implements Screen {
  private readonly app: App;
  private readonly scroll: ScrollState;

  constructor(app: App) {
    this.app = app;
    this.scroll = new ScrollState(() => app.env.now());
  }

  dragTarget(): DragTarget | null {
    return this.scroll;
  }

  open(record: CoreRecord): void {
    if (!isReplayable(record)) {
      this.app.toast('replayUnavailable');
      return;
    }
    this.app.haptic('light');
    this.app.push(new ReplayScreen(this.app, record));
  }

  manage(record: CoreRecord): void {
    const app = this.app;
    app.haptic('light');
    app.env.platform.showActionSheet([app.t(record.isPinned ? 'unpin' : 'pin'), app.t('delete')]).then((index) => {
      if (index === 0) {
        app.env.history.togglePin(record.id);
        app.invalidate();
      } else if (index === 1) {
        app.env.platform
          .confirm({
            title: app.t('delete'),
            content: app.t('deleteRecordConfirm'),
            confirmText: app.t('delete'),
            cancelText: app.t('cancel'),
            destructive: true,
          })
          .then((confirmed) => {
            if (confirmed) {
              app.env.history.delete(record.id);
              app.invalidate();
            }
          });
      }
    });
  }

  draw(ctx: Ctx, ui: Ui, now: number): boolean {
    const env = this.app.env;
    const c = ui.colors;
    const top = drawNavBar(ctx, ui, env, ui.t('historyTitle'), { label: ui.t('close'), tap: () => this.app.pop() });
    const records = env.history.records();
    const width = Math.min(env.width - 32, 560);
    const x = (env.width - width) / 2;
    if (records.length === 0) {
      const cy = (top + env.height) / 2 - 40;
      drawText(ctx, '🕒', env.width / 2, cy, { size: 48, color: c.label, align: 'center' });
      drawText(ctx, ui.t('noHistory'), env.width / 2, cy + 52, {
        size: 18,
        color: c.label,
        weight: 'bold',
        align: 'center',
        maxWidth: width,
      });
      drawText(ctx, ui.t('noHistoryDesc'), env.width / 2, cy + 80, {
        size: 14,
        color: c.secondaryLabel,
        align: 'center',
        maxWidth: width,
      });
      this.scroll.layout({ x: 0, y: top, w: env.width, h: env.height - top }, 0);
      return false;
    }

    const viewport = { x: 0, y: top, w: env.width, h: env.height - top };
    const animating = this.scroll.step(now);
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
    ctx.clip();
    let y = top + 4 - this.scroll.offset;
    drawText(ctx, ui.t('historyHint'), x + 4, y + 8, { size: 12, color: c.secondaryLabel, maxWidth: width });
    y += 24;
    for (const record of records) {
      if (y + ROW_HEIGHT >= top && y <= env.height) {
        this.drawRow(ctx, ui, record, x, y, width);
      }
      ui.hit({
        rect: { x, y, w: width, h: ROW_HEIGHT },
        clip: viewport,
        tap: () => this.open(record),
        longPress: () => this.manage(record),
      });
      y += ROW_HEIGHT + ROW_GAP;
    }
    ctx.restore();
    this.scroll.layout(viewport, y + this.scroll.offset - top + env.safeBottom + 8);
    return animating;
  }

  private drawRow(ctx: Ctx, ui: Ui, record: CoreRecord, x: number, y: number, width: number): void {
    const c = ui.colors;
    fillRoundRect(ctx, { x, y, w: width, h: ROW_HEIGHT }, 14, c.card);
    const code = difficultyFromName(record.difficultyName);
    drawText(ctx, code === null ? '🎮' : DIFFICULTY_ICONS[code], x + 30, y + ROW_HEIGHT / 2, {
      size: 26,
      color: c.label,
      align: 'center',
    });
    const badge = ui.t(record.isWin ? 'win' : 'lose');
    const badgeColor = record.isWin ? c.green : c.red;
    let tx = x + 56;
    if (record.isPinned) {
      drawText(ctx, '📌', tx + 8, y + 24, { size: 14, color: c.orange, align: 'center' });
      tx += 22;
    }
    const titleWidth = drawText(ctx, ui.difficultyName(record.difficultyName), tx, y + 24, {
      size: 16,
      color: c.label,
      weight: 'bold',
      maxWidth: width * 0.4,
    });
    drawText(ctx, badge, tx + titleWidth + 10, y + 24, { size: 13, color: badgeColor, weight: 'bold' });
    drawText(ctx, formatHistoryDate(record.date), x + 56, y + 49, { size: 12, color: c.secondaryLabel, maxWidth: width * 0.45 });
    drawText(ctx, record.duration + 's', x + width - 16, y + 24, {
      size: 16,
      color: c.label,
      weight: 'bold',
      align: 'right',
    });
    if (record.seed !== null) {
      drawText(ctx, '#' + record.seed, x + width - 16, y + 49, {
        size: 12,
        color: c.secondaryLabel,
        align: 'right',
        maxWidth: width * 0.35,
      });
    }
  }
}