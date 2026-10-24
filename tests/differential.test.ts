import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CoreGame, CoreHistory, CoreReplay, MAX_RECORDS } from '../src/core/index.ts';
import type { CoreAction, CoreRecord, CoreSnapshot, DifficultyCode } from '../src/core/index.ts';

type Json = any;

function vectors(name: string): Json {
  return JSON.parse(readFileSync(new URL('./vectors/' + name, import.meta.url), 'utf8'));
}

function assertSnapshot(label: string, expected: Json, actual: CoreSnapshot): void {
  assert.equal(actual.rows, expected.rows, label + ' rows');
  assert.equal(actual.cols, expected.cols, label + ' cols');
  assert.equal(actual.status, expected.status, label + ' status');
  assert.equal(actual.seed, expected.seed, label + ' seed');
  assert.equal(actual.elapsed, expected.elapsed, label + ' elapsed');
  assert.equal(actual.flagsCount, expected.flagsCount, label + ' flagsCount');
  assert.equal(actual.minesCount, expected.minesCount, label + ' minesCount');
  assert.equal(actual.started, expected.started, label + ' started');
  assert.deepEqual(Array.from(actual.cellFlags), expected.cellFlags, label + ' cellFlags');
  assert.deepEqual(Array.from(actual.neighborCounts), expected.neighborCounts, label + ' neighborCounts');
  assert.deepEqual(Array.from(actual.revealDelaysMs), expected.revealDelaysMs, label + ' revealDelays');
  assert.deepEqual(actual.effects, expected.effects, label + ' effects');
  if (expected.record === null || expected.record === undefined) {
    assert.equal(actual.record, null, label + ' record should be null');
    return;
  }
  const record = actual.record;
  assert.ok(record, label + ' record should exist');
  assert.equal(record.isWin, expected.record.isWin, label + ' record isWin');
  assert.equal(record.duration, expected.record.duration, label + ' record duration');
  assert.equal(record.difficultyName, expected.record.difficultyName, label + ' record difficulty');
  assert.equal(record.seed, expected.record.seed, label + ' record seed');
  assert.equal(record.rows, expected.record.rows, label + ' record rows');
  assert.equal(record.cols, expected.record.cols, label + ' record cols');
  assert.deepEqual(record.mineIndices, expected.record.mineIndices, label + ' record mines');
  assert.deepEqual(
    record.moves?.map((move) => [move.index, move.type]),
    expected.record.moves.map((move: Json) => [move.index, move.type]),
    label + ' record moves',
  );
  assert.equal(record.id.length, 36, label + ' record id');
  assert.ok(record.date > 0, label + ' record date');
}

test('game vectors match the Rust core', () => {
  const scenarios: Json[] = vectors('game_vectors.json').scenarios;
  assert.ok(scenarios.length > 10);
  for (const scenario of scenarios) {
    const name: string = scenario.name;
    const game = new CoreGame({
      difficulty: scenario.difficulty as DifficultyCode,
      seed: scenario.seed,
      batteryPercent: scenario.batteryPercent,
      noGuessing: scenario.noGuessing,
      godMode: scenario.godMode,
      nanagokyuu: scenario.nanagokyuu,
    });
    assertSnapshot(name + ' initial', scenario.initial, game.snapshot());
    scenario.steps.forEach((step: Json, i: number) => {
      const action: CoreAction = { kind: step.action, index: step.index };
      assertSnapshot(name + ' step ' + i + ' (' + step.action + ' ' + step.index + ')', step.snapshot, game.apply(action));
    });
    scenario.timeAdvance.forEach((advance: Json, i: number) => {
      assert.equal(game.advanceTime(advance.seconds), advance.elapsed, name + ' advance ' + i);
      assertSnapshot(name + ' advance ' + i, advance.snapshot, game.snapshot());
    });
  }
});

function recordFromJson(obj: Json): CoreRecord {
  return {
    id: obj.id ?? 'generated',
    date: obj.date ?? 0,
    duration: obj.duration,
    difficultyName: obj.difficultyName,
    isWin: obj.isWin,
    isPinned: obj.isPinned ?? false,
    seed: obj.seed ?? null,
    rows: obj.rows ?? null,
    cols: obj.cols ?? null,
    mineIndices: obj.mineIndices ?? null,
    moves: obj.moves?.map((move: Json) => ({ timestamp: move.timestamp ?? 0, index: move.index, type: move.type })) ?? null,
  };
}

test('history vectors match the Rust core', () => {
  const history = new CoreHistory();
  let capHistory: CoreHistory | null = null;
  const ids = (records: CoreRecord[]): string[] => records.map((record) => record.id);
  for (const op of vectors('history_vectors.json').ops) {
    switch (op.op) {
      case 'add':
        assert.deepEqual(ids(history.add(recordFromJson(op.record))), op.expected);
        break;
      case 'togglePin':
        assert.deepEqual(ids(history.togglePin(op.id)), op.expected);
        break;
      case 'delete':
        assert.deepEqual(ids(history.delete(op.id)), op.expected);
        break;
      case 'cap': {
        const local = new CoreHistory();
        capHistory = local;
        let expected: string[] = [];
        for (let i = 0; i < op.count; i++) {
          expected = ids(local.add({
            id: String(i), date: i, duration: 12 + i, difficultyName: 'easy', isWin: true, isPinned: false,
            seed: i, rows: 9, cols: 9, mineIndices: [0, 1, 2],
            moves: [{ timestamp: 0.5, index: 1, type: 'reveal' }, { timestamp: 1.5, index: 2, type: 'flag' }],
          }));
        }
        assert.deepEqual(expected, op.expected);
        break;
      }
      case 'load': {
        const loaded = new CoreHistory();
        loaded.load(op.json);
        assert.deepEqual(ids(loaded.records()), op.expected);
        if (op.encoded !== undefined) {
          const again = new CoreHistory();
          again.load(loaded.encode());
          assert.deepEqual(ids(again.records()), ids(loaded.records()));
          assert.deepEqual(again.records(), loaded.records());
        }
        break;
      }
      default:
        throw new Error('unknown history op ' + op.op);
    }
  }
  assert.ok(capHistory);
  assert.equal(capHistory.records().length, MAX_RECORDS);
});

test('replay vectors match the Rust core', () => {
  const root = vectors('replay_vectors.json');
  const replay = new CoreReplay({
    id: 'replay', date: 0, duration: 3, difficultyName: 'easy', isWin: true, isPinned: false,
    seed: 1, rows: 4, cols: 4, mineIndices: [0, 5, 15],
    moves: [
      { timestamp: 0, index: 6, type: 'reveal' },
      { timestamp: 1, index: 5, type: 'flag' },
      { timestamp: 2, index: 7, type: 'chord' },
      { timestamp: 3, index: 10, type: 'reveal' },
      { timestamp: 4, index: 5, type: 'flag' },
      { timestamp: 5, index: 9, type: 'reveal' },
    ],
  });
  assert.equal(replay.stepCount, root.stepCount);
  for (const seek of root.seeks) {
    assertSnapshot('seek ' + seek.step, seek.snapshot, replay.seek(seek.step));
  }
});
