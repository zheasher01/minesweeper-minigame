import type { Rect } from './metrics.ts';
import type { AppColors } from './theme.ts';

export type Ctx = CanvasRenderingContext2D;
export type FontWeight = 'normal' | 'bold';

const FAMILY = 'sans-serif';

export function font(size: number, weight: FontWeight = 'normal'): string {
  return (weight === 'bold' ? 'bold ' : '') + Math.max(1, Math.round(size * 10) / 10) + 'px ' + FAMILY;
}

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fillRoundRect(ctx: Ctx, rect: Rect, radius: number, color: string | CanvasGradient): void {
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

export function strokeRoundRect(ctx: Ctx, rect: Rect, radius: number, color: string, lineWidth: number): void {
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export interface TextOptions {
  readonly size: number;
  readonly color: string;
  readonly weight?: FontWeight;
  readonly align?: CanvasTextAlign;
  readonly baseline?: CanvasTextBaseline;
  readonly maxWidth?: number;
}

export function drawText(ctx: Ctx, text: string, x: number, y: number, options: TextOptions): number {
  ctx.font = font(options.size, options.weight);
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = options.baseline ?? 'middle';
  const shown = options.maxWidth === undefined ? text : ellipsize(ctx, text, options.maxWidth);
  ctx.fillText(shown, x, y);
  return ctx.measureText(shown).width;
}

export function measureText(ctx: Ctx, text: string, size: number, weight: FontWeight = 'normal'): number {
  ctx.font = font(size, weight);
  return ctx.measureText(text).width;
}

// Expects ctx.font to be set already.
export function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return '';
  }
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(chars.slice(0, mid).join('') + '…').width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return chars.slice(0, low).join('') + '…';
}

// Breaks at spaces for Latin text and between characters for CJK text.
export function wrapText(ctx: Ctx, text: string, maxWidth: number, size: number, weight: FontWeight = 'normal'): string[] {
  ctx.font = font(size, weight);
  const lines: string[] = [];
  let line = '';
  for (const ch of Array.from(text)) {
    const candidate = line + ch;
    if (line !== '' && ctx.measureText(candidate).width > maxWidth) {
      if (ch === ' ') {
        lines.push(line);
        line = '';
        continue;
      }
      const lastSpace = line.lastIndexOf(' ');
      if (lastSpace > 0) {
        lines.push(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1) + ch;
      } else {
        lines.push(line);
        line = ch;
      }
    } else {
      line = candidate;
    }
  }
  if (line !== '') {
    lines.push(line);
  }
  return lines;
}

export const SWITCH_WIDTH = 51;
export const SWITCH_HEIGHT = 31;

export function drawSwitch(ctx: Ctx, x: number, y: number, on: boolean, colors: AppColors): void {
  fillRoundRect(ctx, { x, y, w: SWITCH_WIDTH, h: SWITCH_HEIGHT }, SWITCH_HEIGHT / 2, on ? colors.green : colors.fill);
  ctx.beginPath();
  ctx.arc(on ? x + SWITCH_WIDTH - SWITCH_HEIGHT / 2 : x + SWITCH_HEIGHT / 2, y + SWITCH_HEIGHT / 2, 13.5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

export function drawChevron(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 6);
  ctx.lineTo(x + 3, y);
  ctx.lineTo(x - 3, y + 6);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function drawButton(
  ctx: Ctx,
  rect: Rect,
  label: string,
  background: string,
  foreground: string,
  size = 17,
  radius = 12,
): void {
  fillRoundRect(ctx, rect, radius, background);
  drawText(ctx, label, rect.x + rect.w / 2, rect.y + rect.h / 2, {
    size,
    color: foreground,
    weight: 'bold',
    align: 'center',
    maxWidth: rect.w - 12,
  });
}