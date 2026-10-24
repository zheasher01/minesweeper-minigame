export const FLAG_MINE = 1;
export const FLAG_REVEALED = 2;
export const FLAG_FLAGGED = 4;
export const FLAG_TRIGGERED = 8;

export type DifficultyCode = 'easy' | 'medium' | 'hard' | 'hell';

export interface DifficultySpec {
  readonly rows: number;
  readonly cols: number;
  readonly mines: number;
}

export const DIFFICULTIES: Readonly<Record<DifficultyCode, DifficultySpec>> = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 12, cols: 12, mines: 20 },
  hard: { rows: 16, cols: 16, mines: 45 },
  hell: { rows: 30, cols: 24, mines: 200 },
};

export type GameStatus = 'playing' | 'won' | 'lost';

export type HapticKind = 'light' | 'heavy' | 'success' | 'failure';

export type CoreEffect =
  | { readonly kind: 'haptic'; readonly haptic: HapticKind; readonly delayMs: number }
  | { readonly kind: 'explosion'; readonly delayMs: number; readonly indices: number[] }
  | { readonly kind: 'result'; readonly win: boolean; readonly delayMs: number };

export type ActionKind = 'reveal' | 'flag' | 'chord';

export interface CoreAction {
  readonly kind: ActionKind;
  readonly index: number;
}

export interface CoreConfig {
  readonly difficulty: DifficultyCode;
  readonly seed?: number | null;
  readonly batteryPercent: number;
  readonly noGuessing: boolean;
  readonly godMode: boolean;
  readonly nanagokyuu: boolean;
}

export interface CoreMove {
  timestamp: number;
  index: number;
  type: string;
}

export interface CoreRecord {
  id: string;
  date: number;
  duration: number;
  difficultyName: string;
  isWin: boolean;
  isPinned: boolean;
  seed: number | null;
  rows: number | null;
  cols: number | null;
  mineIndices: number[] | null;
  moves: CoreMove[] | null;
}

export interface CoreSnapshot {
  readonly rows: number;
  readonly cols: number;
  readonly cellFlags: Uint8Array;
  readonly neighborCounts: Uint8Array;
  readonly revealDelaysMs: Uint16Array;
  readonly status: GameStatus;
  readonly seed: number;
  readonly elapsed: number;
  readonly flagsCount: number;
  readonly minesCount: number;
  readonly started: boolean;
  readonly effects: CoreEffect[];
  readonly record: CoreRecord | null;
}
