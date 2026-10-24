import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreGame, CoreHistory, CoreReplay, FLAG_FLAGGED, FLAG_MINE, FLAG_REVEALED, FLAG_TRIGGERED, MAX_RECORDS,
} from '../src/core/index.ts';
import type { CoreMove, CoreRecord, CoreSnapshot, DifficultyCode } from '../src/core/index.ts';
import { Geometry } from '../src/core/geometry.ts';
import { SeededRng, generateEnvironmentalSeed, newRecordId } from '../src/core/rng.ts';
import { isSolvable, solve } from '../src/core/solver.ts';

function game(difficulty: DifficultyCode, seed: number, noGuessing: boolean, extra: Partial<{ godMode: boolean; nanagokyuu: boolean }> = {}): CoreGame {
  return new CoreGame({ difficulty, seed, batteryPercent: 100, noGuessing, godMode: extra.godMode ?? false, nanagokyuu: extra.nanagokyuu ?? false });
}

const reveal = (g: CoreGame, index: number): CoreSnapshot => g.apply({ kind: 'reveal', index });
const mineList = (s: CoreSnapshot): number[] => Array.from(s.cellFlags).flatMap((f, i) => ((f & FLAG_MINE) !== 0 ? [i] : []));
const allSafeRevealed = (s: CoreSnapshot): boolean =>
  Array.from(s.cellFlags).every((f) => (f & FLAG_MINE) !== 0 || (f & FLAG_REVEALED) !== 0);

test('rng: deterministic, bounded, matches u64 LCG reference', () => {
  const a = SeededRng.fromSeed(42);
  const b = SeededRng.fromSeed(42);
  for (let i = 0; i < 1000; i++) assert.deepEqual(a.nextPair(), b.nextPair());
  const r = SeededRng.fromSeed(7);
  for (let i = 0; i < 10000; i++) assert.ok(r.range(37) < 37);
  const mask = (1n << 64n) - 1n;
  for (const seed of [0, 1, -1, 42, 2 ** 40 + 3, -(2 ** 52), Number.MAX_SAFE_INTEGER]) {
    let state = BigInt.asUintN(64, BigInt(seed));
    if (state === 0n) state = 0x0009_8765_4321n;
    const rng = SeededRng.fromSeed(seed);
    for (let i = 0; i < 200; i++) {
      state = (state * 6364136223846793005n + 1442695040888963407n) & mask;
      const upper = 1 + (i * 7919) % 720;
      assert.equal(rng.range(upper), Number(state % BigInt(upper)), 'seed ' + seed + ' step ' + i);
    }
  }
});

test('rng: ids are uuid shaped and unique, environment seed non-negative', () => {
  const a = newRecordId();
  const b = newRecordId();
  assert.equal(a.length, 36);
  assert.notEqual(a, b);
  assert.equal(a[14], '4');
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(generateEnvironmentalSeed(-1) >= 0);
  assert.ok(generateEnvironmentalSeed(100) >= 0);
});

test('geometry: neighbours and chebyshev distance', () => {
  const g = new Geometry(9, 9);
  for (const corner of [0, 8, 72, 80]) assert.equal(g.neighbours(corner).length, 3);
  assert.equal(g.neighbours(40).length, 8);
  assert.ok(Array.from(g.neighbours(40)).includes(31));
  assert.equal(g.chebyshev(0, 0), 0);
  assert.equal(g.chebyshev(0, 1), 1);
  assert.equal(g.chebyshev(0, 10), 1);
});

function countsFromMines(g: Geometry, mines: number[]): Uint8Array {
  const counts = new Uint8Array(g.count);
  for (const mine of mines) for (const n of g.neighbours(mine)) counts[n]++;
  return counts;
}

test('solver: solvable and ambiguous boards', () => {
  const g3 = new Geometry(3, 3);
  assert.ok(isSolvable(g3, countsFromMines(g3, [2]), 6, 1));
  const g14 = new Geometry(1, 4);
  assert.ok(!isSolvable(g14, countsFromMines(g14, [0]), 1, 1));
});

test('solver: never marks a mine safe or invents a mine', () => {
  for (const [rows, cols, total, seed, rounds] of [[16, 16, 45, 77, 100], [9, 9, 10, 1234, 50]]) {
    const g = new Geometry(rows, cols);
    const rng = SeededRng.fromSeed(seed);
    for (let round = 0; round < rounds; round++) {
      const mines: number[] = [];
      while (mines.length < total) {
        const candidate = rng.range(g.count);
        if (!mines.includes(candidate)) mines.push(candidate);
      }
      let start = 0;
      while (mines.includes(start)) start++;
      const outcome = solve(g, countsFromMines(g, mines), start);
      for (let i = 0; i < g.count; i++) {
        if (outcome.knownSafe[i] === 1) assert.ok(!mines.includes(i));
        if (outcome.knownMine[i] === 1) assert.ok(mines.includes(i));
      }
    }
  }
});

test('game: first click is always safe', () => {
  for (let seed = 0; seed < 25; seed++) {
    const s = reveal(game('easy', seed, true), 40);
    assert.equal(s.status, 'playing');
    assert.equal(s.cellFlags[40] & (FLAG_REVEALED | FLAG_MINE), FLAG_REVEALED);
    const m = reveal(game('medium', seed, false), 0);
    assert.notEqual(m.status, 'lost');
    assert.equal(m.cellFlags[0] & FLAG_MINE, 0);
  }
});

test('game: zero region ripples', () => {
  const s = reveal(game('easy', 123, false), 40);
  assert.ok(Array.from(s.cellFlags).filter((f) => (f & FLAG_REVEALED) !== 0).length > 9);
});

test('game: flagging every mine wins immediately', () => {
  const g = game('easy', 8, false);
  let s = reveal(g, 40);
  const mines = mineList(s);
  assert.equal(mines.length, 10);
  for (const mine of mines) s = g.apply({ kind: 'flag', index: mine });
  assert.equal(s.status, 'won');
  assert.ok(s.record);
  assert.ok(allSafeRevealed(s));
});

test('game: revealing the last safe cell wins', () => {
  const g = game('easy', 123, false);
  let s = reveal(g, 40);
  const mines = mineList(s);
  for (let i = 0; i < s.cellFlags.length && s.status === 'playing'; i++) {
    if (!mines.includes(i)) s = reveal(g, i);
  }
  assert.equal(s.status, 'won');
  assert.ok(s.record);
  assert.ok(allSafeRevealed(s));
});

test('game: loss reveals every mine and emits explosion waves', () => {
  const g = game('easy', 9, false);
  const first = reveal(g, 40);
  const mine = mineList(first)[0];
  const s = reveal(g, mine);
  assert.equal(s.status, 'lost');
  assert.equal(s.cellFlags[mine] & FLAG_TRIGGERED, FLAG_TRIGGERED);
  assert.ok(mineList(s).every((i) => (s.cellFlags[i] & FLAG_REVEALED) !== 0));
  assert.ok(s.effects.some((e) => e.kind === 'explosion'));
  assert.ok(s.record);
});

test('game: flags toggle and count, without starting the clock', () => {
  const g = game('easy', 3, false);
  let s = g.apply({ kind: 'flag', index: 0 });
  assert.equal(s.flagsCount, 1);
  assert.equal(s.cellFlags[0] & FLAG_FLAGGED, FLAG_FLAGGED);
  assert.equal(s.started, false);
  s = g.apply({ kind: 'flag', index: 0 });
  assert.equal(s.flagsCount, 0);
  assert.equal(s.cellFlags[0] & FLAG_FLAGGED, 0);
});

test('game: clown and god modes skip history', () => {
  const clown = reveal(game('easy', 5, false, { nanagokyuu: true }), 40);
  assert.equal(clown.status, 'lost');
  assert.equal(clown.record, null);
  const g = game('easy', 5, false, { godMode: true });
  const first = reveal(g, 40);
  const s = reveal(g, mineList(first)[0]);
  assert.equal(s.status, 'lost');
  assert.equal(s.record, null);
});

test('game: seed is exposed and time only advances while playing', () => {
  const fresh = game('easy', 777, false).snapshot();
  assert.equal(fresh.seed, 777);
  assert.equal(fresh.status, 'playing');
  assert.equal(fresh.elapsed, 0);
  const idle = game('easy', 1, false);
  assert.equal(idle.advanceTime(5), 0);
  const g = game('easy', 1, false);
  assert.ok(reveal(g, 40).started);
  assert.equal(g.advanceTime(3), 3);
  assert.equal(g.advanceTime(2), 5);
  assert.equal(g.advanceTime(100000), 5999);
});

test('game: winning chord is recorded before finishing', () => {
  // Mirrors the Rust test: 9x9, one mine at 41 (flagged). Cell 40 is a
  // revealed "1" whose only unrevealed safe neighbour is 39.
  const g = game('easy', 1, false);
  const state = g as unknown as Record<string, any>;
  const mine = 41;
  const safe = 39;
  const chord = 40;
  const cells: Uint8Array = state.cells;
  for (let i = 0; i < 81; i++) {
    cells[i] = i === mine ? FLAG_MINE | FLAG_FLAGGED | FLAG_REVEALED : i === safe ? 0 : FLAG_REVEALED;
  }
  (state.neighbourCounts as Uint8Array).fill(0);
  state.neighbourCounts[chord] = 1;
  state.minesCount = 1;
  state.flagsCount = 1;
  state.flagsOnMines = 1;
  state.safeRevealed = 79;
  state.mineIndices = [mine];
  state.moves = [];
  state.pendingRecord = null;
  state.status = 'playing';
  state.started = true;
  state.firstClick = false;

  const s = g.apply({ kind: 'chord', index: chord });
  assert.equal(s.status, 'won');
  assert.ok(s.record);
  assert.deepEqual(s.record.moves?.map((m) => [m.index, m.type]), [[chord, 'chord']]);
});

const move = (index: number, type: string): CoreMove => ({ timestamp: index, index, type });
function replayRecord(isWin: boolean, moves: CoreMove[]): CoreRecord {
  return { id: 'replay', date: 0, duration: 3, difficultyName: 'easy', isWin, isPinned: false, seed: 1, rows: 3, cols: 3, mineIndices: [0], moves };
}

test('replay: seeking forwards and backwards is deterministic', () => {
  const replay = new CoreReplay(replayRecord(false, [move(1, 'reveal'), move(0, 'flag'), move(0, 'flag')]));
  assert.equal(replay.stepCount, 3);
  assert.ok(Array.from(replay.seek(0).cellFlags).every((f) => (f & FLAG_REVEALED) === 0));
  assert.notEqual(replay.seek(1).cellFlags[1] & FLAG_REVEALED, 0);
  const flagged = replay.seek(2);
  assert.notEqual(flagged.cellFlags[0] & FLAG_FLAGGED, 0);
  assert.equal(flagged.flagsCount, 1);
  const back = replay.seek(1);
  assert.equal(back.cellFlags[0] & FLAG_FLAGGED, 0);
  assert.notEqual(back.cellFlags[1] & FLAG_REVEALED, 0);
  assert.equal(replay.seek(3).cellFlags[0] & FLAG_FLAGGED, 0);
});

test('replay: winning replay reveals all safe cells at the end', () => {
  const replay = new CoreReplay(replayRecord(true, [1, 2, 3, 6, 7, 8].map((i) => move(i, 'reveal'))));
  const s = replay.seek(6);
  assert.equal(s.status, 'won');
  for (let i = 0; i < 9; i++) assert.equal((s.cellFlags[i] & FLAG_REVEALED) !== 0, i !== 0);
});

function historyRecord(id: string, date: number, pinned: boolean): CoreRecord {
  return { id, date, duration: 12, difficultyName: 'easy', isWin: true, isPinned: pinned, seed: 42, rows: 9, cols: 9, mineIndices: [1, 2], moves: [{ timestamp: 0.5, index: 1, type: 'reveal' }] };
}

test('history: roundtrip, pin order, cap', () => {
  const h = new CoreHistory();
  h.add(historyRecord('a', 10, false));
  h.add(historyRecord('b', 20, false));
  const loaded = new CoreHistory();
  loaded.load(h.encode());
  assert.deepEqual(loaded.records().map((r) => r.id), ['b', 'a']);
  const p = new CoreHistory();
  p.add(historyRecord('a', 10, false));
  p.add(historyRecord('b', 20, true));
  p.add(historyRecord('c', 30, false));
  assert.deepEqual(p.records().map((r) => r.id).slice(0, 2), ['b', 'c']);
  const cap = new CoreHistory();
  for (let i = 0; i < 60; i++) cap.add(historyRecord(String(i), i, false));
  assert.equal(cap.records().length, MAX_RECORDS);
  assert.equal(cap.records()[0].id, '59');
});

test('history: cloud merge keeps local on empty/malformed payload and dedupes', () => {
  const local = new CoreHistory();
  local.add(historyRecord('a', 10, false));
  assert.equal(local.mergeCloud(new CoreHistory().encode()).length, 1);
  local.mergeCloud('not json');
  assert.equal(local.records().length, 1);
  local.add(historyRecord('b', 20, false));
  const cloud = new CoreHistory();
  cloud.add(historyRecord('b', 25, false));
  cloud.add(historyRecord('c', 30, false));
  const merged = local.mergeCloud(cloud.encode());
  assert.equal(merged.length, 3);
  assert.equal(merged.find((r) => r.id === 'b')?.date, 25);
});

test('history: legacy Foundation JSON decodes, malformed JSON is ignored', () => {
  const h = new CoreHistory();
  h.load('[{"id":"legacy","date":123.5,"duration":7,"difficultyName":"简单","isWin":false,"isPinned":true,"seed":9,"rows":9,"cols":9,"mineIndices":[0],"moves":[{"timestamp":1.25,"index":0,"type":"reveal"}]}]');
  const records = h.records();
  assert.equal(records.length, 1);
  assert.equal(records[0].difficultyName, '简单');
  assert.equal(records[0].moves?.[0].type, 'reveal');
  const bad = new CoreHistory();
  bad.load('not json');
  assert.deepEqual(bad.records(), []);
});
