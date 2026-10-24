import type { CoreMove, CoreRecord } from './model.ts';

export const MAX_RECORDS = 50;

class DecodeError extends Error {}

function fail(message: string): never {
  throw new DecodeError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isU32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function optional<T>(value: unknown, check: (input: unknown) => T): T | null {
  return value === undefined || value === null ? null : check(value);
}

function u32(value: unknown, field: string): number {
  return isU32(value) ? value : fail('invalid ' + field);
}

function f64(value: unknown, field: string): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fail('invalid ' + field);
}

function decodeMove(value: unknown): CoreMove {
  if (!isObject(value)) {
    fail('invalid move');
  }
  const type = value.type;
  if (typeof type !== 'string') {
    fail('invalid move type');
  }
  return {
    timestamp: f64(value.timestamp, 'timestamp'),
    index: u32(value.index, 'index'),
    type,
  };
}

function decodeRecord(value: unknown): CoreRecord {
  if (!isObject(value)) {
    fail('invalid record');
  }
  const id = value.id;
  if (typeof id !== 'string') {
    fail('invalid id');
  }
  const difficultyName = value.difficultyName ?? '';
  if (typeof difficultyName !== 'string') {
    fail('invalid difficultyName');
  }
  const isWin = value.isWin ?? false;
  const isPinned = value.isPinned ?? false;
  if (typeof isWin !== 'boolean' || typeof isPinned !== 'boolean') {
    fail('invalid flags');
  }
  return {
    id,
    date: f64(value.date, 'date'),
    duration: value.duration === undefined ? 0 : u32(value.duration, 'duration'),
    difficultyName,
    isWin,
    isPinned,
    seed: optional(value.seed, (input) =>
      typeof input === 'number' && Number.isSafeInteger(input) ? input : fail('invalid seed'),
    ),
    rows: optional(value.rows, (input) => u32(input, 'rows')),
    cols: optional(value.cols, (input) => u32(input, 'cols')),
    mineIndices: optional(value.mineIndices, (input) =>
      Array.isArray(input) ? input.map((item) => u32(item, 'mineIndices')) : fail('invalid mineIndices'),
    ),
    moves: optional(value.moves, (input) =>
      Array.isArray(input) ? input.map(decodeMove) : fail('invalid moves'),
    ),
  };
}

function parseRecords(text: string): CoreRecord[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    fail('history must be an array');
  }
  return parsed.map(decodeRecord);
}

function decode(text: string | null | undefined): CoreRecord[] {
  if (text === null || text === undefined || text.length === 0) {
    return [];
  }
  try {
    return parseRecords(text);
  } catch {
    return [];
  }
}

export function cloneRecord(record: CoreRecord): CoreRecord {
  return {
    id: record.id,
    date: record.date,
    duration: record.duration,
    difficultyName: record.difficultyName,
    isWin: record.isWin,
    isPinned: record.isPinned,
    seed: record.seed,
    rows: record.rows,
    cols: record.cols,
    mineIndices: record.mineIndices === null ? null : record.mineIndices.slice(),
    moves:
      record.moves === null
        ? null
        : record.moves.map((move) => ({ timestamp: move.timestamp, index: move.index, type: move.type })),
  };
}

function sortRecords(records: CoreRecord[]): void {
  records.sort((a, b) => {
    const pinned = Number(b.isPinned) - Number(a.isPinned);
    if (pinned !== 0) {
      return pinned;
    }
    if (b.date > a.date) {
      return 1;
    }
    if (b.date < a.date) {
      return -1;
    }
    return 0;
  });
}

function trim(records: CoreRecord[]): void {
  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }
}

export class CoreHistory {
  private list: CoreRecord[] = [];

  load(text: string | null | undefined): void {
    const records = decode(text);
    sortRecords(records);
    trim(records);
    this.list = records;
  }

  encode(): string {
    return JSON.stringify(this.list);
  }

  records(): CoreRecord[] {
    return this.list.map(cloneRecord);
  }

  add(record: CoreRecord): CoreRecord[] {
    this.list.push(cloneRecord(record));
    sortRecords(this.list);
    trim(this.list);
    return this.records();
  }

  delete(id: string): CoreRecord[] {
    this.list = this.list.filter((record) => record.id !== id);
    return this.records();
  }

  togglePin(id: string): CoreRecord[] {
    const record = this.list.find((item) => item.id === id);
    if (record !== undefined) {
      record.isPinned = !record.isPinned;
    }
    sortRecords(this.list);
    return this.records();
  }

  clear(): CoreRecord[] {
    this.list = [];
    return [];
  }

  mergeCloud(text: string): CoreRecord[] {
    let cloud: CoreRecord[];
    try {
      cloud = parseRecords(text);
    } catch {
      return this.records();
    }
    if (cloud.length === 0) {
      return this.records();
    }
    const merged: CoreRecord[] = [];
    const seen = new Set<string>();
    for (const record of cloud.concat(this.list)) {
      if (!seen.has(record.id)) {
        seen.add(record.id);
        merged.push(cloneRecord(record));
      }
    }
    sortRecords(merged);
    trim(merged);
    this.list = merged;
    return this.records();
  }
}
