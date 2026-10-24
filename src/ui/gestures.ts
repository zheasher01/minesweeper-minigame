import type { Point } from './metrics.ts';

export interface Timers {
  set(task: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface DragTarget {
  start(x: number, y: number): boolean;
  move(dx: number, dy: number, x: number, y: number): void;
  end?(): void;
  pinchStart?(centroid: Point, distance: number): boolean;
  pinch?(centroid: Point, ratio: number): void;
  pinchEnd?(): void;
}

export interface GestureHandler {
  longPressMs(x: number, y: number): number | null;
  tap(x: number, y: number): void;
  longPress(x: number, y: number): void;
  dragStart(x: number, y: number): boolean;
  drag(dx: number, dy: number, x: number, y: number): void;
  dragEnd(): void;
  pinchStart(centroid: Point, distance: number): boolean;
  pinch(centroid: Point, ratio: number): void;
  pinchEnd(): void;
}

export const TOUCH_SLOP = 10;

type Mode = 'idle' | 'press' | 'drag' | 'pinch' | 'done';

// Turns raw touches into tap / long press / drag / pinch. The handler is
// captured when the first finger lands so a navigation triggered mid-gesture
// never leaks the rest of the gesture into the new screen.
export class GestureTracker {
  private readonly resolve: () => GestureHandler;
  private readonly timers: Timers;
  private readonly points = new Map<number, Point>();
  private mode: Mode = 'idle';
  private active: GestureHandler | null = null;
  private primaryId = -1;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private pinchIds: [number, number] = [-1, -1];
  private pinchDistance = 1;
  private timer: unknown = null;

  constructor(resolve: () => GestureHandler, timers: Timers) {
    this.resolve = resolve;
    this.timers = timers;
  }

  // Drops touches the platform no longer reports (for example when a native
  // modal swallowed the touchend).
  prune(activeIds: readonly number[]): void {
    for (const id of Array.from(this.points.keys())) {
      if (!activeIds.includes(id)) {
        this.points.delete(id);
      }
    }
    if (this.points.size === 0 && this.mode !== 'idle') {
      this.reset();
    }
  }

  start(id: number, x: number, y: number): void {
    this.points.set(id, { x, y });
    if (this.mode === 'idle') {
      this.active = this.resolve();
      this.mode = 'press';
      this.primaryId = id;
      this.startX = this.lastX = x;
      this.startY = this.lastY = y;
      const ms = this.active.longPressMs(x, y);
      if (ms !== null) {
        this.timer = this.timers.set(() => this.fireLongPress(), ms);
      }
      return;
    }
    if ((this.mode === 'press' || this.mode === 'drag') && this.active !== null) {
      this.clearTimer();
      if (this.mode === 'drag') {
        this.active.dragEnd();
      }
      const first = this.points.get(this.primaryId);
      if (first === undefined) {
        this.mode = 'done';
        return;
      }
      this.pinchIds = [this.primaryId, id];
      const distance = Math.hypot(x - first.x, y - first.y);
      const centroid = { x: (x + first.x) / 2, y: (y + first.y) / 2 };
      if (distance > 0 && this.active.pinchStart(centroid, distance)) {
        this.mode = 'pinch';
        this.pinchDistance = distance;
      } else {
        this.mode = 'done';
      }
    }
  }

  move(id: number, x: number, y: number): void {
    if (!this.points.has(id) || this.active === null) {
      return;
    }
    this.points.set(id, { x, y });
    if (this.mode === 'press' && id === this.primaryId) {
      if (Math.hypot(x - this.startX, y - this.startY) > TOUCH_SLOP) {
        this.clearTimer();
        if (this.active.dragStart(this.startX, this.startY)) {
          this.mode = 'drag';
          this.active.drag(x - this.startX, y - this.startY, x, y);
          this.lastX = x;
          this.lastY = y;
        } else {
          this.mode = 'done';
        }
      }
    } else if (this.mode === 'drag' && id === this.primaryId) {
      this.active.drag(x - this.lastX, y - this.lastY, x, y);
      this.lastX = x;
      this.lastY = y;
    } else if (this.mode === 'pinch' && this.pinchIds.includes(id)) {
      const a = this.points.get(this.pinchIds[0]);
      const b = this.points.get(this.pinchIds[1]);
      if (a !== undefined && b !== undefined) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        this.active.pinch({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance / this.pinchDistance);
      }
    }
  }

  end(id: number): void {
    const point = this.points.get(id);
    if (point === undefined) {
      return;
    }
    this.points.delete(id);
    const handler = this.active;
    if (handler !== null) {
      if (this.mode === 'press' && id === this.primaryId) {
        this.clearTimer();
        this.mode = 'done';
        handler.tap(point.x, point.y);
      } else if (this.mode === 'drag' && id === this.primaryId) {
        this.mode = 'done';
        handler.dragEnd();
      } else if (this.mode === 'pinch' && this.pinchIds.includes(id)) {
        this.mode = 'done';
        handler.pinchEnd();
      }
    }
    if (this.points.size === 0) {
      this.reset();
    }
  }

  cancel(): void {
    this.clearTimer();
    if (this.active !== null) {
      if (this.mode === 'drag') {
        this.active.dragEnd();
      } else if (this.mode === 'pinch') {
        this.active.pinchEnd();
      }
    }
    this.points.clear();
    this.reset();
  }

  private fireLongPress(): void {
    this.timer = null;
    const point = this.points.get(this.primaryId);
    if (this.mode === 'press' && this.active !== null && point !== undefined) {
      this.mode = 'done';
      this.active.longPress(point.x, point.y);
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }

  private reset(): void {
    this.clearTimer();
    this.mode = 'idle';
    this.active = null;
    this.primaryId = -1;
  }
}