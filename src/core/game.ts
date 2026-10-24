import { Geometry } from './geometry.ts';
import {
  DIFFICULTIES,
  FLAG_FLAGGED,
  FLAG_MINE,
  FLAG_REVEALED,
  FLAG_TRIGGERED,
} from './model.ts';
import type {
  CoreAction,
  CoreConfig,
  CoreEffect,
  CoreMove,
  CoreRecord,
  CoreSnapshot,
  DifficultySpec,
  GameStatus,
} from './model.ts';
import {
  NANAGOKYUU_SEED_MASK,
  SeededRng,
  generateEnvironmentalSeed,
  newRecordId,
  nowReferenceDate,
  seedToHalves,
} from './rng.ts';
import { isSolvable } from './solver.ts';

const REVEAL_DELAY_STEP_MS = 45;
const REVEAL_DELAY_MAX_MS = 1500;
const EXPLOSION_WAVE_STEP_MS = 90;
const EXPLOSION_RESULT_EXTRA_MS = 350;
const WIN_RESULT_DELAY_MS = 250;
const NO_GUESS_ATTEMPTS = 2000;
const MAX_ELAPSED_SECONDS = 99 * 60 + 59;
const U16_MAX = 65535;

export interface GameOptions {
  readonly now?: () => number;
}

export class CoreGame {
  private readonly config: CoreConfig;
  private readonly spec: DifficultySpec;
  private readonly geometry: Geometry;
  private readonly now: () => number;
  private readonly cells: Uint8Array;
  private readonly neighbourCounts: Uint8Array;
  private readonly revealDelays: Uint16Array;
  private readonly scratchSafe: Uint8Array;
  private readonly seed: number;
  private status: GameStatus = 'playing';
  private elapsed = 0;
  private started = false;
  private firstClick = true;
  private flagsCount = 0;
  private flagsOnMines = 0;
  private minesCount = 0;
  private safeRevealed = 0;
  private mineIndices: number[] = [];
  private moves: CoreMove[] = [];
  private moveStart: number | null = null;
  private pendingRecord: CoreRecord | null = null;
  private effects: CoreEffect[] = [];

  constructor(config: CoreConfig, options: GameOptions = {}) {
    const spec = DIFFICULTIES[config.difficulty];
    if (spec === undefined) {
      throw new RangeError('Unknown difficulty: ' + String(config.difficulty));
    }
    const seed = config.seed ?? generateEnvironmentalSeed(config.batteryPercent);
    seedToHalves(seed);
    this.config = config;
    this.spec = spec;
    this.seed = seed;
    this.now = options.now ?? Date.now;
    this.geometry = new Geometry(spec.rows, spec.cols);
    const count = this.geometry.count;
    this.cells = new Uint8Array(count);
    this.neighbourCounts = new Uint8Array(count);
    this.revealDelays = new Uint16Array(count);
    this.scratchSafe = new Uint8Array(count);
  }

  apply(action: CoreAction): CoreSnapshot {
    this.effects = [];
    this.revealDelays.fill(0);
    switch (action.kind) {
      case 'reveal':
        this.reveal(action.index, true, true);
        break;
      case 'flag':
        this.toggleFlag(action.index);
        break;
      case 'chord':
        this.chord(action.index);
        break;
      default:
        throw new RangeError('Unknown action: ' + String((action as { kind: unknown }).kind));
    }
    return this.makeSnapshot(true);
  }

  snapshot(): CoreSnapshot {
    return this.makeSnapshot(false);
  }

  advanceTime(seconds: number): number {
    if (this.status === 'playing' && this.started && Number.isFinite(seconds) && seconds > 0) {
      this.elapsed = Math.min(this.elapsed + Math.floor(seconds), MAX_ELAPSED_SECONDS);
    }
    return this.elapsed;
  }

  private inBounds(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.geometry.count;
  }

  private safeTotal(): number {
    return Math.max(0, this.geometry.count - this.minesCount);
  }

  private markStarted(): void {
    if (this.moveStart === null) {
      this.moveStart = this.now();
    }
  }

  private recordMove(index: number, type: string): void {
    this.markStarted();
    const start = this.moveStart ?? this.now();
    this.moves.push({ timestamp: Math.max(0, this.now() - start) / 1000, index, type });
  }

  private reveal(index: number, recordMove: boolean, emitHaptic: boolean): void {
    if (this.status !== 'playing' || !this.inBounds(index)) {
      return;
    }
    if ((this.cells[index] & (FLAG_REVEALED | FLAG_FLAGGED)) !== 0) {
      return;
    }
    if (recordMove) {
      this.recordMove(index, 'reveal');
    } else {
      this.markStarted();
    }

    if (this.firstClick) {
      this.firstClick = false;
      this.started = true;
      if (this.config.nanagokyuu) {
        this.injectNanagokyuuMines(index);
      } else {
        this.placeMines(index);
      }
    }

    if ((this.cells[index] & FLAG_MINE) !== 0) {
      this.triggerLoss(index);
      return;
    }

    this.floodFill(index);
    if (emitHaptic) {
      this.effects.push({ kind: 'haptic', haptic: 'light', delayMs: 0 });
    }
    this.checkWinAfterReveal();
    this.checkWinAfterFlag();
  }

  private toggleFlag(index: number): void {
    if (this.status !== 'playing' || !this.inBounds(index)) {
      return;
    }
    const flags = this.cells[index];
    if ((flags & FLAG_REVEALED) !== 0) {
      return;
    }
    this.markStarted();
    const isMine = (flags & FLAG_MINE) !== 0;
    if ((flags & FLAG_FLAGGED) !== 0) {
      this.cells[index] = flags & ~FLAG_FLAGGED;
      this.flagsCount = Math.max(0, this.flagsCount - 1);
      if (isMine) {
        this.flagsOnMines = Math.max(0, this.flagsOnMines - 1);
      }
    } else {
      this.cells[index] = flags | FLAG_FLAGGED;
      this.flagsCount++;
      if (isMine) {
        this.flagsOnMines++;
      }
    }
    this.recordMove(index, 'flag');
    this.effects.push({ kind: 'haptic', haptic: 'heavy', delayMs: 0 });
    this.checkWinAfterFlag();
  }

  private chord(index: number): void {
    if (this.status !== 'playing' || !this.inBounds(index)) {
      return;
    }
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
      this.effects.push({ kind: 'haptic', haptic: 'failure', delayMs: 0 });
      return;
    }

    this.markStarted();
    this.recordMove(index, 'chord');

    let didReveal = false;
    for (const neighbour of neighbours) {
      if (this.status !== 'playing') {
        break;
      }
      if ((this.cells[neighbour] & (FLAG_REVEALED | FLAG_FLAGGED)) !== 0) {
        continue;
      }
      didReveal = true;
      this.reveal(neighbour, false, false);
    }
    if (didReveal && this.status === 'playing') {
      this.effects.push({ kind: 'haptic', haptic: 'light', delayMs: 0 });
    }
  }

  private checkWinAfterReveal(): void {
    if (this.status === 'playing' && this.safeRevealed >= this.safeTotal()) {
      let lastWave = 0;
      for (let i = 0; i < this.revealDelays.length; i++) {
        if (this.revealDelays[i] > lastWave) {
          lastWave = this.revealDelays[i];
        }
      }
      this.finish(true, lastWave + WIN_RESULT_DELAY_MS);
    }
  }

  private checkWinAfterFlag(): void {
    if (this.status !== 'playing') {
      return;
    }
    if (
      this.minesCount > 0 &&
      this.flagsCount === this.minesCount &&
      this.flagsOnMines === this.minesCount
    ) {
      this.finish(true, WIN_RESULT_DELAY_MS);
    }
  }

  private finish(win: boolean, resultDelayMs: number): void {
    if (this.status !== 'playing') {
      return;
    }
    this.status = win ? 'won' : 'lost';
    if (win) {
      this.revealAllSafe();
      this.effects.push({ kind: 'haptic', haptic: 'success', delayMs: 0 });
    } else {
      this.effects.push({ kind: 'haptic', haptic: 'failure', delayMs: resultDelayMs });
    }
    this.effects.push({ kind: 'result', win, delayMs: resultDelayMs });
    this.makeRecord(win);
  }

  private revealAllSafe(): void {
    for (let i = 0; i < this.cells.length; i++) {
      const flags = this.cells[i];
      if ((flags & FLAG_MINE) === 0 && (flags & FLAG_REVEALED) === 0) {
        this.cells[i] = flags | FLAG_REVEALED;
        this.revealDelays[i] = 0;
      }
    }
    this.safeRevealed = this.safeTotal();
  }

  private makeRecord(win: boolean): void {
    if (this.config.godMode || this.config.nanagokyuu) {
      return;
    }
    const wallNow = Date.now();
    this.pendingRecord = {
      id: newRecordId(wallNow),
      date: nowReferenceDate(wallNow),
      duration: this.elapsed,
      difficultyName: this.config.difficulty,
      isWin: win,
      isPinned: false,
      seed: this.seed,
      rows: this.geometry.rows,
      cols: this.geometry.cols,
      mineIndices: this.mineIndices.slice(),
      moves: this.moves.map((move) => ({ timestamp: move.timestamp, index: move.index, type: move.type })),
    };
  }

  private triggerLoss(center: number): void {
    this.cells[center] |= FLAG_REVEALED | FLAG_TRIGGERED;
    this.revealDelays[center] = 0;

    const maxRadius = Math.max(this.geometry.rows, this.geometry.cols);
    const waves: number[][] = [];
    for (let d = 0; d <= maxRadius; d++) {
      waves.push([]);
    }
    for (let i = 0; i < this.cells.length; i++) {
      if ((this.cells[i] & FLAG_MINE) === 0) {
        continue;
      }
      const distance = this.geometry.chebyshev(center, i);
      this.cells[i] |= FLAG_REVEALED;
      this.revealDelays[i] = Math.min(distance * EXPLOSION_WAVE_STEP_MS, U16_MAX);
      waves[distance].push(i);
    }

    this.effects.push({ kind: 'haptic', haptic: 'heavy', delayMs: 0 });

    let lastDelay = 0;
    for (let distance = 0; distance < waves.length; distance++) {
      const indices = waves[distance];
      if (indices.length === 0) {
        continue;
      }
      const delay = distance * EXPLOSION_WAVE_STEP_MS;
      lastDelay = Math.max(lastDelay, delay);
      this.effects.push({ kind: 'explosion', delayMs: delay, indices });
    }
    this.finish(false, lastDelay + EXPLOSION_RESULT_EXTRA_MS);
  }

  private floodFill(start: number): void {
    if ((this.cells[start] & (FLAG_MINE | FLAG_FLAGGED)) !== 0) {
      return;
    }
    const offsets = this.geometry.offsets;
    const adjacency = this.geometry.adjacency;
    const queueIndex: number[] = [start];
    const queueDepth: number[] = [0];
    let head = 0;
    while (head < queueIndex.length) {
      const index = queueIndex[head];
      const depth = queueDepth[head];
      head++;
      const flags = this.cells[index];
      if ((flags & (FLAG_MINE | FLAG_FLAGGED | FLAG_REVEALED)) !== 0) {
        continue;
      }
      this.cells[index] = flags | FLAG_REVEALED;
      this.safeRevealed++;
      this.revealDelays[index] = Math.min(depth * REVEAL_DELAY_STEP_MS, REVEAL_DELAY_MAX_MS);

      if (this.neighbourCounts[index] === 0) {
        const nextDepth = Math.min(depth + 1, U16_MAX);
        for (let k = offsets[index]; k < offsets[index + 1]; k++) {
          const neighbour = adjacency[k];
          if ((this.cells[neighbour] & (FLAG_REVEALED | FLAG_FLAGGED)) === 0) {
            queueIndex.push(neighbour);
            queueDepth.push(nextDepth);
          }
        }
      }
    }
  }

  private placeMines(safeIndex: number): void {
    const count = this.geometry.count;
    const totalMines = Math.min(this.spec.mines, Math.max(0, count - 1));
    const attempts = this.config.noGuessing ? NO_GUESS_ATTEMPTS : 1;
    const rng = SeededRng.fromSeed(this.seed);
    const safe = this.scratchSafe;

    safe.fill(0);
    safe[safeIndex] = 1;
    for (const neighbour of this.geometry.neighbours(safeIndex)) {
      safe[neighbour] = 1;
    }
    let safeSize = 0;
    for (let i = 0; i < count; i++) {
      safeSize += safe[i];
    }
    if (totalMines > Math.max(0, count - safeSize)) {
      safe.fill(0);
      safe[safeIndex] = 1;
    }

    let finalMines = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
      for (let i = 0; i < count; i++) {
        this.cells[i] &= ~FLAG_MINE;
      }
      this.mineIndices = [];
      const available: number[] = [];
      for (let i = 0; i < count; i++) {
        if (safe[i] === 0) {
          available.push(i);
        }
      }
      const minesToPlace = Math.min(totalMines, available.length);
      for (let i = 0; i < minesToPlace; i++) {
        const pick = i + rng.range(available.length - i);
        const swap = available[i];
        available[i] = available[pick];
        available[pick] = swap;
        const index = available[i];
        this.cells[index] |= FLAG_MINE;
        this.mineIndices.push(index);
      }
      this.computeNeighbourCounts();
      finalMines = minesToPlace;
      if (
        !this.config.noGuessing ||
        isSolvable(this.geometry, this.neighbourCounts, safeIndex, minesToPlace)
      ) {
        break;
      }
    }

    this.minesCount = finalMines;
    this.recomputeFlagsOnMines();
  }

  private injectNanagokyuuMines(clicked: number): void {
    const halves = seedToHalves(this.seed);
    const rng = new SeededRng(halves[0], (halves[1] ^ NANAGOKYUU_SEED_MASK) >>> 0);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] &= ~FLAG_MINE;
    }
    this.mineIndices = [clicked];
    this.cells[clicked] |= FLAG_MINE;
    for (let i = 0; i < this.cells.length; i++) {
      if (i !== clicked && rng.chance(50)) {
        this.cells[i] |= FLAG_MINE;
        this.mineIndices.push(i);
      }
    }
    this.computeNeighbourCounts();
    this.minesCount = this.mineIndices.length;
    this.recomputeFlagsOnMines();
  }

  private computeNeighbourCounts(): void {
    const counts = this.neighbourCounts;
    const offsets = this.geometry.offsets;
    const adjacency = this.geometry.adjacency;
    counts.fill(0);
    for (const mine of this.mineIndices) {
      for (let k = offsets[mine]; k < offsets[mine + 1]; k++) {
        const neighbour = adjacency[k];
        if (counts[neighbour] < 255) {
          counts[neighbour]++;
        }
      }
    }
  }

  private recomputeFlagsOnMines(): void {
    let total = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const flags = this.cells[i];
      if ((flags & FLAG_FLAGGED) !== 0 && (flags & FLAG_MINE) !== 0) {
        total++;
      }
    }
    this.flagsOnMines = total;
  }

  private makeSnapshot(take: boolean): CoreSnapshot {
    const effects = take ? this.effects : [];
    if (take) {
      this.effects = [];
    }
    const record = take ? this.pendingRecord : null;
    if (take) {
      this.pendingRecord = null;
    }
    return {
      rows: this.geometry.rows,
      cols: this.geometry.cols,
      cellFlags: this.cells.slice(),
      neighborCounts: this.neighbourCounts.slice(),
      revealDelaysMs: this.revealDelays.slice(),
      status: this.status,
      seed: this.seed,
      elapsed: this.elapsed,
      flagsCount: this.flagsCount,
      minesCount: this.minesCount === 0 ? this.spec.mines : this.minesCount,
      started: this.started,
      effects,
      record,
    };
  }
}
