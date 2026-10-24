import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { FLAG_REVEALED } from '../src/core/index.ts';
import { GestureTracker } from '../src/ui/gestures.ts';
import type { GestureHandler, Timers } from '../src/ui/gestures.ts';
import { LANGUAGES, TEXT_KEYS, resolveLanguage, translate } from '../src/ui/i18n.ts';
import {
  boardSize,
  clampViewport,
  fitBoard,
  formatClock,
  indexAt,
  parseSeedInput,
  pinchViewport,
  toContent,
  uiScaleFor,
} from '../src/ui/metrics.ts';
import { GameSession, HistoryStore, ReplaySession } from '../src/ui/session.ts';
import { Settings } from '../src/ui/settings.ts';

class FakeTimers implements Timers {
  now = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; task: () => void }>();

  set(task: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + ms, task });
    return id;
  }

  clear(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      let nextId = -1;
      let nextAt = Infinity;
      for (const [id, entry] of this.tasks) {
        if (entry.at <= end && entry.at < nextAt) {
          nextAt = entry.at;
          nextId = id;
        }
      }
      if (nextId < 0) {
        break;
      }
      const entry = this.tasks.get(nextId)!;
      this.tasks.delete(nextId);
      this.now = entry.at;
      entry.task();
    }
    this.now = end;
  }
}

class MemoryStorage {
  data = new Map<string, string>();
  storageGet(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  storageSet(key: string, value: string): void {
    this.data.set(key, value);
  }
}

test('seed input parsing covers easter eggs and safe range', () => {
  assert.deepEqual(parseSeedInput(' 123456 '), { kind: 'seed', seed: 123456 });
  assert.deepEqual(parseSeedInput('-42'), { kind: 'seed', seed: -42 });
  assert.deepEqual(parseSeedInput('CytiMax'), { kind: 'godMode' });
  assert.deepEqual(parseSeedInput('nanagokyuu'), { kind: 'nanagokyuu' });
  assert.equal(parseSeedInput('9007199254740993').kind, 'invalid');
  assert.equal(parseSeedInput('12.5').kind, 'invalid');
  assert.equal(parseSeedInput('').kind, 'invalid');
});

test('clock formatting', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(65), '01:05');
  assert.equal(formatClock(5999), '99:59');
});

test('board fits and gap taps snap to a cell', () => {
  const metrics = fitBoard(375, 500, 30, 24);
  assert.ok(metrics.cellSize >= 8 && metrics.cellSize <= 56);
  const size = boardSize(metrics, 30, 24);
  assert.ok(size.width <= 375 || metrics.cellSize === 8);
  const stride = metrics.cellSize + metrics.spacing;
  assert.equal(indexAt(metrics, metrics.padding + stride - 1, metrics.padding + 1, 30, 24), 0);
  assert.equal(indexAt(metrics, metrics.padding + stride + 1, metrics.padding + 1, 30, 24), 1);
  assert.equal(indexAt(metrics, 0, 0, 30, 24), null);
  assert.equal(indexAt(metrics, size.width - metrics.padding, size.height - metrics.padding, 30, 24), 30 * 24 - 1);
});

test('pinch zoom clamps to 1x-4x and keeps the focus point', () => {
  const container = { x: 0, y: 100, w: 300, h: 300 };
  const content = { width: 300, height: 300 };
  const start = { scale: 1, offsetX: 0, offsetY: 0 };
  const focus = { x: 100, y: 200 };
  const zoomed = pinchViewport(start, content, container, focus, focus, 2);
  assert.equal(zoomed.scale, 2);
  const before = toContent(start, content, container, focus.x, focus.y);
  const after = toContent(zoomed, content, container, focus.x, focus.y);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  assert.equal(pinchViewport(start, content, container, focus, focus, 10).scale, 4);
  assert.equal(pinchViewport(start, content, container, focus, focus, 0.1).scale, 1);
  assert.deepEqual(clampViewport({ scale: 1, offsetX: 50, offsetY: -50 }, content, container), { scale: 1, offsetX: 0, offsetY: 0 });
});

test('every language has every key', () => {
  for (const language of LANGUAGES) {
    for (const key of TEXT_KEYS) {
      assert.ok(translate(language.code, key).length > 0, language.code + ' ' + key);
    }
  }
  assert.equal(resolveLanguage(null, 'zh_CN'), 'zh-Hans');
  assert.equal(resolveLanguage(null, 'zh_TW'), 'zh-Hant');
  assert.equal(resolveLanguage(null, 'ja'), 'ja');
  assert.equal(resolveLanguage(null, 'fr_FR'), 'en');
  assert.equal(resolveLanguage('ja', 'zh_CN'), 'ja');
});

test('settings persist with iOS keys and defaults', () => {
  const storage = new MemoryStorage();
  const settings = new Settings(storage, 'en');
  assert.equal(settings.haptics, true);
  assert.equal(settings.noGuessing, true);
  assert.equal(settings.theme, 'Classic');
  assert.equal(settings.appearance, 'system');
  settings.noGuessing = false;
  settings.theme = 'Flower';
  settings.language = 'zh-Hant';
  const reloaded = new Settings(storage, 'en');
  assert.equal(reloaded.noGuessing, false);
  assert.equal(reloaded.theme, 'Flower');
  assert.equal(reloaded.language, 'zh-Hant');
  assert.equal(storage.data.get('isNoGuessingEnabled'), 'false');
});

function recordingHandler(log: string[]): GestureHandler {
  return {
    longPressMs: () => 250,
    tap: (x, y) => log.push('tap ' + x + ',' + y),
    longPress: () => log.push('long'),
    dragStart: () => {
      log.push('dragStart');
      return true;
    },
    drag: (dx, dy) => log.push('drag ' + dx + ',' + dy),
    dragEnd: () => log.push('dragEnd'),
    pinchStart: () => {
      log.push('pinchStart');
      return true;
    },
    pinch: (_c, ratio) => log.push('pinch ' + ratio),
    pinchEnd: () => log.push('pinchEnd'),
  };
}

test('gestures distinguish tap, long press, drag and pinch', () => {
  const timers = new FakeTimers();
  const log: string[] = [];
  const tracker = new GestureTracker(() => recordingHandler(log), timers);

  tracker.start(1, 10, 10);
  timers.advance(100);
  tracker.end(1);
  assert.deepEqual(log.splice(0), ['tap 10,10']);

  tracker.start(1, 10, 10);
  timers.advance(250);
  tracker.end(1);
  assert.deepEqual(log.splice(0), ['long']);

  tracker.start(1, 10, 10);
  tracker.move(1, 30, 10);
  tracker.move(1, 35, 12);
  tracker.end(1);
  timers.advance(500);
  assert.deepEqual(log.splice(0), ['dragStart', 'drag 20,0', 'drag 5,2', 'dragEnd']);

  tracker.start(1, 0, 0);
  tracker.start(2, 100, 0);
  tracker.move(2, 200, 0);
  tracker.end(2);
  tracker.end(1);
  assert.deepEqual(log.splice(0), ['pinchStart', 'pinch 2', 'pinchEnd']);
});

function makeSession(timers: FakeTimers, history: HistoryStore, difficulty: 'easy' | 'hell' = 'easy', seed = 12345) {
  let changes = 0;
  const haptics: string[] = [];
  const session = new GameSession(
    {
      timers,
      history,
      now: () => timers.now,
      haptic: (kind) => haptics.push(kind),
      batteryPercent: () => 80,
      noGuessing: () => true,
      onChange: () => changes++,
    },
    difficulty,
    seed,
    false,
    false,
  );
  return { session, haptics, changes: () => changes };
}

function playToEnd(session: GameSession, timers: FakeTimers): void {
  session.reveal(0);
  for (let guard = 0; guard < 500 && session.status === 'playing'; guard++) {
    const flags = session.snapshot.cellFlags;
    let next = -1;
    for (let i = 0; i < flags.length; i++) {
      if ((flags[i] & FLAG_REVEALED) === 0) {
        next = i;
        break;
      }
    }
    if (next < 0) {
      break;
    }
    timers.advance(1100);
    session.reveal(next);
  }
}

test('game session runs the clock, schedules the result and saves history', () => {
  const timers = new FakeTimers();
  const storage = new MemoryStorage();
  const history = new HistoryStore(storage);
  const { session } = makeSession(timers, history);
  assert.equal(session.status, 'playing');
  assert.equal(session.snapshot.started, false);
  session.reveal(40);
  assert.equal(session.snapshot.started || session.status !== 'playing', true);
  if (session.status === 'playing') {
    timers.advance(3000);
    assert.equal(session.elapsed, 3);
    session.pause();
    timers.advance(5000);
    assert.equal(session.elapsed, 3);
    session.resume();
  }
  playToEnd(session, timers);
  assert.ok(session.status !== 'playing');
  timers.advance(5000);
  assert.ok(session.status === 'won' || session.status === 'lost');
  assert.equal(session.showResult, true);
  assert.equal(history.records().length, 1);
  assert.ok(storage.data.has('gameHistory'));

  session.startNewGame();
  assert.equal(session.status, 'playing');
  assert.equal(session.showResult, false);
  assert.equal(session.elapsed, 0);
});

test('starting a new game cancels pending result effects', () => {
  const timers = new FakeTimers();
  const history = new HistoryStore(new MemoryStorage());
  const { session } = makeSession(timers, history);
  playToEnd(session, timers);
  session.startNewGame();
  timers.advance(10000);
  assert.equal(session.showResult, false);
  assert.equal(session.status, 'playing');
});

test('replay session plays at 1x/2x/4x and seeks', () => {
  const timers = new FakeTimers();
  const history = new HistoryStore(new MemoryStorage());
  const { session } = makeSession(timers, history);
  playToEnd(session, timers);
  const record = history.records()[0];
  assert.ok(record.moves !== null && record.moves.length > 0);

  const replay = new ReplaySession(record, { timers, onChange: () => undefined });
  assert.equal(replay.step, 0);
  replay.togglePlay();
  timers.advance(500);
  assert.equal(replay.step, Math.min(1, replay.stepCount));
  replay.cycleSpeed();
  assert.equal(replay.speed, 2);
  timers.advance(250);
  assert.equal(replay.step, Math.min(2, replay.stepCount));
  replay.cycleSpeed();
  replay.cycleSpeed();
  assert.equal(replay.speed, 1);
  replay.seek(replay.stepCount);
  assert.equal(replay.playing, false);
  assert.equal(replay.progress, 1);
  replay.togglePlay();
  assert.equal(replay.step, 0);
  replay.dispose();
});
// iOS canvas renders U+FE0F / keycap sequences and text-presentation
// symbols as tofu boxes, so the UI must draw those as vector icons.
test('UI source avoids symbols that break on iOS canvas', () => {
  const banned = /[\uFE0F\u20E3\u2300-\u23FF\u2600-\u26FF\u2700-\u27BF]/u;
  const allowed = new Set(['✓', '⛔', '×', '…', '·']);
  const files = readdirSync('src', { recursive: true }) as string[];
  for (const file of files.filter((name) => name.endsWith('.ts'))) {
    const text = readFileSync(join('src', file), 'utf8');
    for (const ch of text) {
      if (banned.test(ch) && !allowed.has(ch)) {
        assert.fail(file + ' contains U+' + ch.codePointAt(0)!.toString(16).toUpperCase());
      }
    }
  }
});

test('ui scale fills larger phones and keeps standard phones at 1x', () => {
  assert.equal(uiScaleFor(375, 667), 1);
  assert.equal(uiScaleFor(390, 844), 1);
  assert.equal(uiScaleFor(414, 896), 1.062);
  assert.equal(uiScaleFor(430, 932), 1.103);
  assert.equal(uiScaleFor(1024, 1366), 1.25);
  assert.equal(uiScaleFor(0, 0), 1);
});