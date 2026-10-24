import { FLAG_FLAGGED, FLAG_MINE, FLAG_REVEALED, FLAG_TRIGGERED } from '../core/index.ts';
import type { CoreSnapshot } from '../core/index.ts';
import { drawText, fillRoundRect } from './draw.ts';
import type { Ctx } from './draw.ts';
import type { DragTarget } from './gestures.ts';
import {
  IDENTITY_VIEWPORT,
  boardSize,
  cellOrigin,
  clampViewport,
  contains,
  fitBoard,
  indexAt,
  pinchViewport,
  toContent,
} from './metrics.ts';
import type { BoardMetrics, Point, Rect, Size, Viewport } from './metrics.ts';
import type { Explosion } from './session.ts';
import { coveredColor, numberColor } from './theme.ts';
import type { AppColors, Skin } from './theme.ts';

export const FLIP_MS = 300;
export const EXPLODE_MS = 250;

// Single-canvas board renderer with flip, ripple and explosion animations,
// pinch zoom (1x-4x) and panning.
export class BoardView {
  rows = 0;
  cols = 0;
  view: Viewport = IDENTITY_VIEWPORT;
  container: Rect = { x: 0, y: 0, w: 0, h: 0 };
  metrics: BoardMetrics = fitBoard(0, 0, 0, 0);
  content: Size = { width: 0, height: 0 };

  private flags = new Uint8Array(0);
  private counts = new Uint8Array(0);
  private revealAt = new Float64Array(0);
  private animUntil = 0;
  private explodeAt = new Map<number, number>();
  private explodeUntil = 0;
  private explosionSource: readonly Explosion[] | null = null;
  private pinchFrom: { view: Viewport; centroid: Point } | null = null;

  readonly drag: DragTarget = {
    start: () => true,
    move: (dx, dy) => {
      this.view = clampViewport(
        { scale: this.view.scale, offsetX: this.view.offsetX + dx, offsetY: this.view.offsetY + dy },
        this.content,
        this.container,
      );
    },
    pinchStart: (centroid) => {
      this.pinchFrom = { view: this.view, centroid };
      return true;
    },
    pinch: (centroid, ratio) => {
      if (this.pinchFrom !== null) {
        this.view = pinchViewport(this.pinchFrom.view, this.content, this.container, this.pinchFrom.centroid, centroid, ratio);
      }
    },
    pinchEnd: () => {
      this.pinchFrom = null;
    },
  };

  setContainer(rect: Rect): void {
    const c = this.container;
    if (c.x !== rect.x || c.y !== rect.y || c.w !== rect.w || c.h !== rect.h) {
      this.container = rect;
      this.refit();
    }
  }

  update(snapshot: CoreSnapshot, at: number, animate: boolean): void {
    const count = snapshot.rows * snapshot.cols;
    if (snapshot.rows !== this.rows || snapshot.cols !== this.cols || this.flags.length !== count) {
      this.rows = snapshot.rows;
      this.cols = snapshot.cols;
      this.flags = new Uint8Array(count);
      this.revealAt = new Float64Array(count).fill(Infinity);
      this.view = IDENTITY_VIEWPORT;
      this.refit();
    }
    const previous = this.flags;
    for (let i = 0; i < count; i++) {
      const was = (previous[i] & FLAG_REVEALED) !== 0;
      const is = (snapshot.cellFlags[i] & FLAG_REVEALED) !== 0;
      if (!is) {
        this.revealAt[i] = Infinity;
      } else if (!was) {
        if (animate) {
          this.revealAt[i] = at + (snapshot.revealDelaysMs[i] ?? 0);
          this.animUntil = Math.max(this.animUntil, this.revealAt[i] + FLIP_MS);
        } else {
          this.revealAt[i] = -Infinity;
        }
      }
    }
    this.flags = snapshot.cellFlags.slice();
    this.counts = snapshot.neighborCounts.slice();
  }

  setExplosions(explosions: readonly Explosion[]): void {
    if (explosions === this.explosionSource) {
      return;
    }
    this.explosionSource = explosions;
    this.explodeAt = new Map();
    this.explodeUntil = 0;
    for (const wave of explosions) {
      for (const index of wave.indices) {
        if (!this.explodeAt.has(index)) {
          this.explodeAt.set(index, wave.at);
        }
      }
      this.explodeUntil = Math.max(this.explodeUntil, wave.at + EXPLODE_MS);
    }
  }

  isRevealed(index: number): boolean {
    return (this.flags[index] & FLAG_REVEALED) !== 0;
  }

  hitIndex(x: number, y: number): number | null {
    if (this.rows === 0 || !contains(this.container, x, y)) {
      return null;
    }
    const point = toContent(this.view, this.content, this.container, x, y);
    return indexAt(this.metrics, point.x, point.y, this.rows, this.cols);
  }

  draw(ctx: Ctx, now: number, colors: AppColors, skin: Skin, godMode: boolean): boolean {
    if (this.rows === 0) {
      return false;
    }
    const c = this.container;
    const cs = this.metrics.cellSize;
    const radius = Math.max(1.5, cs * 0.2);
    const cover = coveredColor(skin, colors);
    const cellRect: Rect = { x: 0, y: 0, w: cs, h: cs };
    const shine = ctx.createLinearGradient(0, 0, cs, cs);
    shine.addColorStop(0, 'rgba(255,255,255,0.3)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.save();
    ctx.beginPath();
    ctx.rect(c.x, c.y, c.w, c.h);
    ctx.clip();
    ctx.translate(c.x + c.w / 2 + this.view.offsetX, c.y + c.h / 2 + this.view.offsetY);
    ctx.scale(this.view.scale, this.view.scale);
    ctx.translate(-this.content.width / 2, -this.content.height / 2);
    fillRoundRect(ctx, { x: 0, y: 0, w: this.content.width, h: this.content.height }, 20, colors.boardBackground);

    for (let i = 0; i < this.flags.length; i++) {
      const bits = this.flags[i];
      const origin = cellOrigin(this.metrics, i, this.cols);
      let revealed = false;
      let scaleX = 1;
      if ((bits & FLAG_REVEALED) !== 0 && now >= this.revealAt[i]) {
        const progress = (now - this.revealAt[i]) / FLIP_MS;
        if (progress >= 1) {
          revealed = true;
        } else if (progress < 0.5) {
          scaleX = 1 - progress * 2;
        } else {
          revealed = true;
          scaleX = progress * 2 - 1;
        }
      }
      const start = this.explodeAt.get(i);
      let explode = 0;
      let particle = -1;
      if (start !== undefined && now >= start && now < start + EXPLODE_MS) {
        particle = (now - start) / EXPLODE_MS;
        explode = Math.sin(Math.PI * particle);
      }

      ctx.save();
      if (scaleX !== 1 || explode > 0) {
        const grow = 1 + explode * 0.15;
        ctx.translate(origin.x + cs / 2, origin.y + cs / 2);
        ctx.scale(Math.max(0.02, scaleX) * grow, grow);
        ctx.translate(-cs / 2, -cs / 2);
      } else {
        ctx.translate(origin.x, origin.y);
      }

      if (!revealed) {
        fillRoundRect(ctx, cellRect, radius, godMode && (bits & FLAG_MINE) !== 0 ? colors.orange : cover);
        fillRoundRect(ctx, cellRect, radius, shine);
        if ((bits & FLAG_FLAGGED) !== 0) {
          drawText(ctx, '🚩', cs / 2, cs / 2, { size: cs * 0.5, color: colors.label, align: 'center' });
        }
      } else {
        const isMine = (bits & FLAG_MINE) !== 0;
        const triggered = isMine && (bits & FLAG_TRIGGERED) !== 0;
        fillRoundRect(ctx, cellRect, radius, triggered ? colors.red : colors.card);
        if (isMine) {
          drawText(ctx, skin.explosionIcon, cs / 2, cs / 2, { size: cs * 0.7, color: colors.label, align: 'center' });
        } else if (this.counts[i] > 0) {
          drawText(ctx, String(this.counts[i]), cs / 2, cs / 2 + cs * 0.03, {
            size: cs * 0.7,
            color: numberColor(this.counts[i], colors),
            weight: 'bold',
            align: 'center',
          });
        }
        if (explode > 0) {
          ctx.globalAlpha = 0.65 * explode;
          fillRoundRect(ctx, cellRect, radius, skin.explodedColor);
          ctx.globalAlpha = 1;
        }
        if (triggered && particle >= 0) {
          drawParticles(ctx, cs, particle, colors.orange, skin.explodedColor);
        }
      }
      ctx.restore();
    }
    ctx.restore();
    return now < this.animUntil || now < this.explodeUntil;
  }

  private refit(): void {
    this.metrics = fitBoard(this.container.w, this.container.h, this.rows, this.cols);
    this.content = boardSize(this.metrics, this.rows, this.cols);
    this.view = clampViewport(this.view, this.content, this.container);
  }
}

function drawParticles(ctx: Ctx, size: number, progress: number, primary: string, secondary: string): void {
  const radius = size * 0.45 * progress;
  ctx.globalAlpha = 1 - progress;
  for (let i = 0; i < 8; i++) {
    const outer = i % 2 === 0;
    const angle = ((i * 45) * Math.PI) / 180;
    const distance = outer ? radius : radius * 0.8;
    ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(angle) * distance, size / 2 + Math.sin(angle) * distance, size * (outer ? 0.05 : 0.04), 0, Math.PI * 2);
    ctx.fillStyle = outer ? primary : secondary;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}