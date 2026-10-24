import { UNIX_TO_APPLE_REFERENCE } from '../core/rng.ts';
import type { CoreRecord, DifficultyCode } from '../core/index.ts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface BoardMetrics {
  readonly cellSize: number;
  readonly spacing: number;
  readonly padding: number;
}

export interface Viewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const IDENTITY_VIEWPORT: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };

export const DESIGN_WIDTH = 390;
export const DESIGN_HEIGHT = 844;
export const MAX_UI_SCALE = 1.25;

// The layout is designed for a 390x844pt phone. Larger phones (Plus / Pro Max)
// scale the whole UI up so it fills the screen; smaller phones keep 1x and scroll.
export function uiScaleFor(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) {
    return 1;
  }
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  return Math.round(clamp(scale, 1, MAX_UI_SCALE) * 1000) / 1000;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function fitBoard(
  availableWidth: number,
  availableHeight: number,
  rows: number,
  cols: number,
  maxCell = 56,
  minCell = 8,
  padding = 16,
  spacing = 2,
): BoardMetrics {
  if (rows <= 0 || cols <= 0) {
    return { cellSize: 35, spacing: 2, padding: 20 };
  }
  const widthLimited = (availableWidth - padding * 2 - Math.max(0, cols - 1) * spacing) / cols;
  const heightLimited = (availableHeight - padding * 2 - Math.max(0, rows - 1) * spacing) / rows;
  const cellSize = Math.min(maxCell, Math.max(minCell, Math.floor(Math.min(widthLimited, heightLimited))));
  return { cellSize, spacing, padding };
}

export function boardSize(metrics: BoardMetrics, rows: number, cols: number): Size {
  return {
    width: metrics.padding * 2 + cols * metrics.cellSize + Math.max(0, cols - 1) * metrics.spacing,
    height: metrics.padding * 2 + rows * metrics.cellSize + Math.max(0, rows - 1) * metrics.spacing,
  };
}

export function cellOrigin(metrics: BoardMetrics, index: number, cols: number): Point {
  const stride = metrics.cellSize + metrics.spacing;
  return {
    x: metrics.padding + (index % cols) * stride,
    y: metrics.padding + Math.floor(index / cols) * stride,
  };
}

// Touches in the gap between cells snap to the neighbouring cell, so the 2px
// gutter on the hell board never swallows a tap.
export function indexAt(metrics: BoardMetrics, x: number, y: number, rows: number, cols: number): number | null {
  const localX = x - metrics.padding;
  const localY = y - metrics.padding;
  if (rows <= 0 || cols <= 0 || localX < 0 || localY < 0) {
    return null;
  }
  const gridWidth = cols * metrics.cellSize + Math.max(0, cols - 1) * metrics.spacing;
  const gridHeight = rows * metrics.cellSize + Math.max(0, rows - 1) * metrics.spacing;
  if (localX > gridWidth || localY > gridHeight) {
    return null;
  }
  const stride = metrics.cellSize + metrics.spacing;
  const col = Math.min(cols - 1, Math.floor(localX / stride));
  const row = Math.min(rows - 1, Math.floor(localY / stride));
  return row * cols + col;
}

export function clampViewport(view: Viewport, content: Size, container: Rect): Viewport {
  const scale = clamp(view.scale, MIN_ZOOM, MAX_ZOOM);
  const maxX = Math.max(0, (content.width * scale - container.w) / 2);
  const maxY = Math.max(0, (content.height * scale - container.h) / 2);
  return {
    scale,
    offsetX: clamp(view.offsetX, -maxX, maxX) + 0,
    offsetY: clamp(view.offsetY, -maxY, maxY) + 0,
  };
}

export function toContent(view: Viewport, content: Size, container: Rect, x: number, y: number): Point {
  return {
    x: (x - (container.x + container.w / 2) - view.offsetX) / view.scale + content.width / 2,
    y: (y - (container.y + container.h / 2) - view.offsetY) / view.scale + content.height / 2,
  };
}

// The content point under the starting centroid stays under the fingers while
// the centroid movement pans the board.
export function pinchViewport(
  start: Viewport,
  content: Size,
  container: Rect,
  startCentroid: Point,
  centroid: Point,
  distanceRatio: number,
): Viewport {
  const scale = clamp(start.scale * distanceRatio, MIN_ZOOM, MAX_ZOOM);
  const ratio = scale / start.scale;
  const focusX = startCentroid.x - (container.x + container.w / 2) - start.offsetX;
  const focusY = startCentroid.y - (container.y + container.h / 2) - start.offsetY;
  return clampViewport(
    {
      scale,
      offsetX: start.offsetX + focusX * (1 - ratio) + (centroid.x - startCentroid.x),
      offsetY: start.offsetY + focusY * (1 - ratio) + (centroid.y - startCentroid.y),
    },
    content,
    container,
  );
}

export type SeedInput =
  | { readonly kind: 'seed'; readonly seed: number }
  | { readonly kind: 'godMode' }
  | { readonly kind: 'nanagokyuu' }
  | { readonly kind: 'invalid' };

export function parseSeedInput(text: string): SeedInput {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'cytimax') {
    return { kind: 'godMode' };
  }
  if (lower === 'nanagokyuu') {
    return { kind: 'nanagokyuu' };
  }
  if (/^[+-]?\d+$/.test(trimmed)) {
    const seed = Number(trimmed);
    if (Number.isSafeInteger(seed)) {
      return { kind: 'seed', seed: seed === 0 ? 0 : seed };
    }
  }
  return { kind: 'invalid' };
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
}

export function formatHistoryDate(referenceDate: number): string {
  const date = new Date((referenceDate + UNIX_TO_APPLE_REFERENCE) * 1000);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return (
    date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
    ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes())
  );
}

export function difficultyFromName(name: string): DifficultyCode | null {
  switch (name.toLowerCase()) {
    case 'easy':
    case '简单':
    case '簡單':
      return 'easy';
    case 'medium':
    case '普通':
      return 'medium';
    case 'hard':
    case '困难':
    case '困難':
      return 'hard';
    case 'hell':
    case '地狱':
    case '地獄':
      return 'hell';
    default:
      return null;
  }
}

export const DIFFICULTY_ICONS: Readonly<Record<DifficultyCode, string>> = {
  easy: '😊',
  medium: '😐',
  hard: '😰',
  hell: '😈',
};

export function isReplayable(record: CoreRecord): boolean {
  return (
    record.rows !== null && record.rows > 0 &&
    record.cols !== null && record.cols > 0 &&
    record.mineIndices !== null && record.mineIndices.length > 0 &&
    record.moves !== null && record.moves.length > 0
  );
}

function pad2(value: number): string {
  return value < 10 ? '0' + value : String(value);
}