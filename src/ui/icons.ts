import { drawText, ellipsize, fillRoundRect, font } from './draw.ts';
import type { Ctx, FontWeight } from './draw.ts';

// Vector icons for symbols that iOS canvas cannot render as emoji
// (anything needing U+FE0F or a keycap sequence shows up as a tofu box).

export type IconPainter = (cx: number, cy: number, size: number) => void;

export const PICKAXE_HEAD = '#8E8E93';
export const PICKAXE_HANDLE = '#B5651D';

export function drawGear(ctx: Ctx, cx: number, cy: number, radius: number, color: string, holeColor: string): void {
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * Math.PI) / 4);
    fillRoundRect(ctx, { x: -radius * 0.2, y: -radius, w: radius * 0.4, h: radius * 0.5 }, radius * 0.08, color);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.76, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = holeColor;
  ctx.fill();
}

export function drawPickaxe(ctx: Ctx, cx: number, cy: number, size: number, head: string, handle: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.3);
  ctx.lineTo(0, size * 0.5);
  ctx.strokeStyle = handle;
  ctx.lineWidth = size * 0.11;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, size * 0.25, size * 0.6, -Math.PI / 2 - 0.75, -Math.PI / 2 + 0.75);
  ctx.strokeStyle = head;
  ctx.lineWidth = size * 0.14;
  ctx.stroke();
  ctx.restore();
}

export function drawHashBadge(ctx: Ctx, cx: number, cy: number, size: number, color: string): void {
  fillRoundRect(ctx, { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, size * 0.22, color);
  drawText(ctx, '#', cx, cy + size * 0.03, { size: size * 0.7, color: '#FFFFFF', weight: 'bold', align: 'center' });
}

export function drawStopwatch(ctx: Ctx, cx: number, cy: number, size: number, color: string): void {
  const radius = size * 0.36;
  const centerY = cy + size * 0.07;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.1;
  ctx.beginPath();
  ctx.arc(cx, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  fillRoundRect(ctx, { x: cx - size * 0.11, y: centerY - radius - size * 0.17, w: size * 0.22, h: size * 0.1 }, size * 0.03, color);
  ctx.beginPath();
  ctx.moveTo(cx, centerY);
  ctx.lineTo(cx, centerY - radius * 0.6);
  ctx.stroke();
}

export function drawPlay(ctx: Ctx, cx: number, cy: number, size: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.3, cy - size * 0.38);
  ctx.lineTo(cx - size * 0.3, cy + size * 0.38);
  ctx.lineTo(cx + size * 0.38, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawPause(ctx: Ctx, cx: number, cy: number, size: number, color: string): void {
  const h = size * 0.76;
  fillRoundRect(ctx, { x: cx - size * 0.3, y: cy - h / 2, w: size * 0.22, h }, 2, color);
  fillRoundRect(ctx, { x: cx + size * 0.08, y: cy - h / 2, w: size * 0.22, h }, 2, color);
}

export function drawSkipBack(ctx: Ctx, cx: number, cy: number, size: number, color: string): void {
  const h = size * 0.76;
  fillRoundRect(ctx, { x: cx - size * 0.42, y: cy - h / 2, w: size * 0.13, h }, 1.5, color);
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.38, cy - h / 2);
  ctx.lineTo(cx + size * 0.38, cy + h / 2);
  ctx.lineTo(cx - size * 0.26, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Draws an icon followed by text, centred as one group on cx.
export function drawIconLabel(
  ctx: Ctx,
  icon: IconPainter,
  text: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  weight: FontWeight,
  maxWidth: number,
): void {
  const iconSize = size + 2;
  const gap = 6;
  ctx.font = font(size, weight);
  const shown = ellipsize(ctx, text, Math.max(0, maxWidth - iconSize - gap));
  const textWidth = ctx.measureText(shown).width;
  const left = cx - (iconSize + gap + textWidth) / 2;
  icon(left + iconSize / 2, cy, iconSize);
  drawText(ctx, shown, left + iconSize + gap, cy, { size, color, weight });
}