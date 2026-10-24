import { Geometry } from './geometry.ts';
import { FLAG_FLAGGED, FLAG_MINE, FLAG_REVEALED, FLAG_TRIGGERED } from './model.ts';
import type { CoreMove, CoreRecord, CoreSnapshot } from './model.ts';

const CHECKPOINT_INTERVAL = 16;
const DEFAULT_SIDE = 9;

interface Checkpoint {
  readonly step: number;
  readonly cells: Uint8Array;
}

function boardSide(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return DEFAULT_SIDE;
  }
  return Math.max(1, value);
}

export class CoreReplay {
  private readonly geometry: Geometry;
  private readonly cells: Uint8Array;
  private readonly neighbourCounts: Uint8Array;
  private readonly moves: readonly CoreMove[];
  private readonly isWin: boolean;
  private readonly checkpoints: Checkpoint[] = [];
  private step = 0;

  constructor(record: CoreRecord) {
    this.geometry = new Geometry(boardSide(record.rows), boardSide(record.cols));
    const count = this.geometry.count;
    this.cells = new Uint8Array(count);
    for (const index of record.mineIndices ?? []) {
      if (Number.isInteger(index) && index >= 0 && index < count) {
        this.cells[index] |= FLAG_MINE;
      }
    }
    this.neighbourCounts = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      if ((this.cells[i] & FLAG_MINE) === 0) {
        let mines = 0;
        for (const neighbour of this.geometry.neighbours(i)) {
          if ((this.cells[neighbour] & FLAG_MINE) !== 0) {
            mines++;
          }
        }
        this.neighbourCounts[i] = mines;
      }
    }
    this.moves = (record.moves ?? []).map((move) => ({ timestamp: move.timestamp, index: move.index, type: move.type }));
    this.isWin = record.isWin;
    this.resetVisibility();
    this.checkpoints.push({ step: 0, cells: this.cells.slice() });
  }

  get stepCount(): number {
    return this.moves.length;
  }

  get moveList(): readonly CoreMove[] {
    return this.moves;
  }

  seek(step: number): CoreSnapshot {
    const target = Math.min(Math.max(0, Math.floor(Number.isFinite(step) ? step : 0)), this.moves.length);
    if (target < this.step) {
      let restored: Checkpoint | undefined;
      for (let i = this.checkpoints.length - 1; i >= 0; i--) {
        if (this.checkpoints[i].step <= target) {
          restored = this.checkpoints[i];
          break;
        }
      }
      if (restored !== undefined) {
        this.cells.set(restored.cells);
        this.step = restored.step;
      } else {
        this.resetVisibility();
        this.step = 0;
      }
    }
    while (this.step < target) {
      this.applyMove(this.moves[this.step]);
      this.step++;
      if (this.step % CHECKPOINT_INTERVAL === 0 && !this.checkpoints.some((cp) => cp.step === this.step)) {
        this.checkpoints.push({ step: this.step, cells: this.cells.slice() });
      }
    }
    if (this.isWin && this.step === this.moves.length) {
      this.revealAllSafe();
    }
    return this.snapshot();
  }

  private resetVisibility(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] &= FLAG_MINE;
    }
  }

  private applyMove(move: CoreMove): void {
    const index = move.index;
    if (!Number.isInteger(index) || index < 0 || index >= this.cells.length) {
      return;
    }
    if (move.type === 'flag') {
      if ((this.cells[index] & FLAG_REVEALED) === 0) {
        this.cells[index] ^= FLAG_FLAGGED;
      }
    } else if (move.type === 'chord') {
      this.chord(index);
    } else {
      this.reveal(index);
    }
  }

  private reveal(index: number): void {
    if ((this.cells[index] & (FLAG_REVEALED | FLAG_FLAGGED)) !== 0) {
      return;
    }
    if ((this.cells[index] & FLAG_MINE) !== 0) {
      this.cells[index] |= FLAG_REVEALED | FLAG_TRIGGERED;
      return;
    }
    const queue: number[] = [index];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head];
      head++;
      if ((this.cells[current] & (FLAG_MINE | FLAG_REVEALED | FLAG_FLAGGED)) !== 0) {
        continue;
      }
      this.cells[current] |= FLAG_REVEALED;
      if (this.neighbourCounts[current] === 0) {
        for (const neighbour of this.geometry.neighbours(current)) {
          if ((this.cells[neighbour] & (FLAG_REVEALED | FLAG_FLAGGED)) === 0) {
            queue.push(neighbour);
          }
        }
      }
    }
  }

  private chord(index: number): void {
    if ((this.cells[index] & FLAG_REVEALED) === 0) {
      return;
    }
    const number = this.neighbourCounts[index];
    if (number === 0) {
      return;
    }
    const neighbours = Array.from(this.geometry.neighbours(index));
    let flagged = 0;
    for (const neighbour of neighbours) {
      if ((this.cells[neighbour] & FLAG_FLAGGED) !== 0) {
        flagged++;
      }
    }
    if (flagged !== number) {
      return;
    }
    for (const neighbour of neighbours) {
      if ((this.cells[neighbour] & (FLAG_REVEALED | FLAG_FLAGGED)) === 0) {
        this.reveal(neighbour);
      }
    }
  }

  private revealAllSafe(): void {
    for (let i = 0; i < this.cells.length; i++) {
      if ((this.cells[i] & FLAG_MINE) === 0) {
        this.cells[i] |= FLAG_REVEALED;
      }
    }
  }

  private snapshot(): CoreSnapshot {
    let flags = 0;
    let mines = 0;
    for (let i = 0; i < this.cells.length; i++) {
      if ((this.cells[i] & FLAG_FLAGGED) !== 0) {
        flags++;
      }
      if ((this.cells[i] & FLAG_MINE) !== 0) {
        mines++;
      }
    }
    return {
      rows: this.geometry.rows,
      cols: this.geometry.cols,
      cellFlags: this.cells.slice(),
      neighborCounts: this.neighbourCounts.slice(),
      revealDelaysMs: new Uint16Array(this.cells.length),
      status: this.isWin && this.step === this.moves.length ? 'won' : 'playing',
      seed: 0,
      elapsed: 0,
      flagsCount: flags,
      minesCount: mines,
      started: true,
      effects: [],
      record: null,
    };
  }
}
