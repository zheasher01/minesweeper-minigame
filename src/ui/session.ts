import { CoreGame, CoreHistory, CoreReplay } from '../core/index.ts';
import type { CoreRecord, CoreSnapshot, DifficultyCode, HapticKind } from '../core/index.ts';
import type { Timers } from './gestures.ts';
import { DIFFICULTY_ICONS, clamp } from './metrics.ts';

export interface KeyValueStorage {
  storageGet(key: string): string | null;
  storageSet(key: string, value: string): void;
}

export const HISTORY_KEY = 'gameHistory';

export class HistoryStore {
  private readonly storage: KeyValueStorage;
  private readonly core = new CoreHistory();

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
    this.core.load(storage.storageGet(HISTORY_KEY));
  }

  records(): CoreRecord[] {
    return this.core.records();
  }

  add(record: CoreRecord): void {
    this.core.add(record);
    this.save();
  }

  delete(id: string): void {
    this.core.delete(id);
    this.save();
  }

  togglePin(id: string): void {
    this.core.togglePin(id);
    this.save();
  }

  clear(): void {
    this.core.clear();
    this.save();
  }

  private save(): void {
    this.storage.storageSet(HISTORY_KEY, this.core.encode());
  }
}

export interface Explosion {
  readonly at: number;
  readonly indices: readonly number[];
}

export interface SessionEnv {
  readonly timers: Timers;
  readonly history: HistoryStore;
  now(): number;
  haptic(kind: HapticKind): void;
  batteryPercent(): number;
  noGuessing(): boolean;
  onChange(): void;
}

export type SessionStatus = 'playing' | 'exploding' | 'won' | 'lost';

// Owns the clock, effect scheduling and history persistence around CoreGame.
// Every rule lives in the core.
export class GameSession {
  readonly difficulty: DifficultyCode;
  readonly godMode: boolean;
  readonly nanagokyuu: boolean;
  snapshot!: CoreSnapshot;
  status: SessionStatus = 'playing';
  elapsed = 0;
  showResult = false;
  version = 0;
  appliedAt = 0;
  animate = false;
  explosions: Explosion[] = [];

  private readonly env: SessionEnv;
  private core!: CoreGame;
  private generation = 0;
  private readonly handles = new Set<unknown>();
  private tickHandle: unknown = null;
  private lastTick = 0;
  private paused = false;

  constructor(env: SessionEnv, difficulty: DifficultyCode, seed: number | null, godMode: boolean, nanagokyuu: boolean) {
    this.env = env;
    this.difficulty = difficulty;
    this.godMode = godMode;
    this.nanagokyuu = nanagokyuu;
    this.startNewGame(seed);
  }

  get resetIcon(): string {
    if (this.nanagokyuu) {
      return '🤡';
    }
    if (this.godMode) {
      return '👀';
    }
    return DIFFICULTY_ICONS[this.difficulty];
  }

  get remainingMines(): number {
    return Math.max(0, this.snapshot.minesCount - this.snapshot.flagsCount);
  }

  get interactive(): boolean {
    return this.status === 'playing';
  }

  startNewGame(seed: number | null = null): void {
    this.cancelEffects();
    this.stopTimer();
    this.showResult = false;
    this.core = new CoreGame(
      {
        difficulty: this.difficulty,
        seed,
        batteryPercent: this.env.batteryPercent(),
        noGuessing: this.difficulty !== 'hell' && this.env.noGuessing(),
        godMode: this.godMode,
        nanagokyuu: this.nanagokyuu,
      },
      { now: () => this.env.now() },
    );
    this.publish(this.core.snapshot(), false);
  }

  reveal(index: number): void {
    if (this.guard(index)) {
      this.publish(this.core.apply({ kind: 'reveal', index }), true);
    }
  }

  toggleFlag(index: number): void {
    if (this.guard(index)) {
      this.publish(this.core.apply({ kind: 'flag', index }), true);
    }
  }

  chord(index: number): void {
    if (this.guard(index)) {
      this.publish(this.core.apply({ kind: 'chord', index }), true);
    }
  }

  dismissResult(): void {
    this.showResult = false;
    this.env.onChange();
  }

  pause(): void {
    this.paused = true;
    this.stopTimer();
  }

  resume(): void {
    this.paused = false;
    this.startTimerIfNeeded();
  }

  dispose(): void {
    this.cancelEffects();
    this.stopTimer();
  }

  private guard(index: number): boolean {
    return this.status === 'playing' && Number.isInteger(index) && index >= 0 && index < this.snapshot.cellFlags.length;
  }

  private publish(snapshot: CoreSnapshot, handleEffects: boolean): void {
    this.snapshot = snapshot;
    this.version++;
    this.appliedAt = this.env.now();
    this.animate = handleEffects;
    if (snapshot.status === 'lost') {
      this.status = handleEffects && snapshot.effects.length > 0 ? 'exploding' : 'lost';
    } else {
      this.status = snapshot.status;
    }
    this.elapsed = snapshot.elapsed;
    if (this.status === 'playing' && snapshot.started) {
      this.startTimerIfNeeded();
    } else {
      this.stopTimer();
    }
    if (snapshot.record !== null) {
      this.env.history.add(snapshot.record);
    }
    if (handleEffects) {
      this.handleEffects(snapshot);
    }
    this.env.onChange();
  }

  private handleEffects(snapshot: CoreSnapshot): void {
    const explosions: Explosion[] = [];
    for (const effect of snapshot.effects) {
      if (effect.kind === 'haptic') {
        const kind = effect.haptic;
        this.schedule(effect.delayMs, () => this.env.haptic(kind));
      } else if (effect.kind === 'explosion') {
        explosions.push({ at: this.appliedAt + effect.delayMs, indices: effect.indices });
      } else {
        const win = effect.win;
        this.schedule(effect.delayMs, () => {
          this.status = win ? 'won' : 'lost';
          this.showResult = true;
          this.env.onChange();
        });
      }
    }
    if (explosions.length > 0) {
      this.explosions = explosions;
    }
  }

  private schedule(delayMs: number, task: () => void): void {
    const generation = this.generation;
    if (delayMs <= 0) {
      task();
      return;
    }
    const handle: unknown = this.env.timers.set(() => {
      this.handles.delete(handle);
      if (generation === this.generation) {
        task();
      }
    }, delayMs);
    this.handles.add(handle);
  }

  private cancelEffects(): void {
    this.generation++;
    for (const handle of this.handles) {
      this.env.timers.clear(handle);
    }
    this.handles.clear();
    this.explosions = [];
  }

  private startTimerIfNeeded(): void {
    if (this.tickHandle !== null || this.paused || this.status !== 'playing' || !this.snapshot.started) {
      return;
    }
    this.lastTick = this.env.now();
    this.tickHandle = this.env.timers.set(() => this.tick(), 1000);
  }

  private tick(): void {
    this.tickHandle = null;
    if (this.status !== 'playing') {
      return;
    }
    const now = this.env.now();
    const delta = clamp(Math.round((now - this.lastTick) / 1000), 1, 5);
    this.elapsed = this.core.advanceTime(delta);
    this.env.onChange();
    this.startTimerIfNeeded();
  }

  private stopTimer(): void {
    if (this.tickHandle !== null) {
      this.env.timers.clear(this.tickHandle);
      this.tickHandle = null;
    }
  }
}

export interface ReplayEnv {
  readonly timers: Timers;
  onChange(): void;
}

export const REPLAY_STEP_MS = 500;
export const REPLAY_SPEEDS: readonly number[] = [1, 2, 4];

export class ReplaySession {
  readonly record: CoreRecord;
  snapshot: CoreSnapshot;
  step = 0;
  playing = false;
  speed = 1;
  version = 0;
  animate = false;

  private readonly env: ReplayEnv;
  private readonly replay: CoreReplay;
  private handle: unknown = null;

  constructor(record: CoreRecord, env: ReplayEnv) {
    this.record = record;
    this.env = env;
    this.replay = new CoreReplay(record);
    this.snapshot = this.replay.seek(0);
  }

  get stepCount(): number {
    return this.replay.stepCount;
  }

  get progress(): number {
    return this.stepCount > 0 ? this.step / this.stepCount : 0;
  }

  togglePlay(): void {
    if (this.playing) {
      this.stop();
    } else {
      if (this.step >= this.stepCount) {
        this.apply(0, false);
      }
      this.playing = true;
      this.scheduleNext();
    }
    this.env.onChange();
  }

  seek(step: number): void {
    this.stop();
    this.apply(step, false);
    this.env.onChange();
  }

  cycleSpeed(): void {
    const index = REPLAY_SPEEDS.indexOf(this.speed);
    this.speed = REPLAY_SPEEDS[(index + 1) % REPLAY_SPEEDS.length];
    if (this.playing) {
      this.clearTimer();
      this.scheduleNext();
    }
    this.env.onChange();
  }

  dispose(): void {
    this.stop();
  }

  private stop(): void {
    this.playing = false;
    this.clearTimer();
  }

  private apply(step: number, animate: boolean): void {
    const target = clamp(Math.floor(step), 0, this.stepCount);
    this.snapshot = this.replay.seek(target);
    this.step = target;
    this.animate = animate;
    this.version++;
  }

  private scheduleNext(): void {
    this.handle = this.env.timers.set(() => {
      this.handle = null;
      if (!this.playing) {
        return;
      }
      if (this.step < this.stepCount) {
        this.apply(this.step + 1, true);
      }
      if (this.step >= this.stepCount) {
        this.playing = false;
      } else {
        this.scheduleNext();
      }
      this.env.onChange();
    }, Math.max(1, Math.round(REPLAY_STEP_MS / this.speed)));
  }

  private clearTimer(): void {
    if (this.handle !== null) {
      this.env.timers.clear(this.handle);
      this.handle = null;
    }
  }
}