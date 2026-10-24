import type { Geometry } from './geometry.ts';

export interface SolveOutcome {
  readonly knownSafe: Uint8Array;
  readonly knownMine: Uint8Array;
  readonly safeCount: number;
}

export function solve(geometry: Geometry, neighbourCounts: ArrayLike<number>, start: number): SolveOutcome {
  const n = geometry.count;
  const offsets = geometry.offsets;
  const adjacency = geometry.adjacency;
  const knownSafe = new Uint8Array(n);
  const knownMine = new Uint8Array(n);
  const unknown = new Uint8Array(n);
  const minesAround = new Uint8Array(n);
  const inQueue = new Uint8Array(n);
  const queue: number[] = [];

  for (let i = 0; i < n; i++) {
    unknown[i] = offsets[i + 1] - offsets[i];
  }

  const push = (index: number): void => {
    if (inQueue[index] === 0) {
      inQueue[index] = 1;
      queue.push(index);
    }
  };

  knownSafe[start] = 1;
  let safeCount = 1;
  for (let k = offsets[start]; k < offsets[start + 1]; k++) {
    const neighbour = adjacency[k];
    if (unknown[neighbour] > 0) {
      unknown[neighbour]--;
    }
  }
  push(start);

  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head++;
    inQueue[index] = 0;

    if (knownMine[index] === 1 || knownSafe[index] === 0) {
      continue;
    }
    const number = neighbourCounts[index];
    const unknownCount = unknown[index];
    if (unknownCount === 0) {
      continue;
    }
    let knownMines = minesAround[index];
    const begin = offsets[index];
    const end = offsets[index + 1];

    if (unknownCount === Math.max(0, number - knownMines)) {
      for (let k = begin; k < end; k++) {
        const neighbour = adjacency[k];
        if (knownSafe[neighbour] === 1 || knownMine[neighbour] === 1) {
          continue;
        }
        knownMine[neighbour] = 1;
        for (let j = offsets[neighbour]; j < offsets[neighbour + 1]; j++) {
          const other = adjacency[j];
          if (unknown[other] > 0) {
            unknown[other]--;
          }
          if (knownSafe[other] === 1) {
            if (minesAround[other] < 255) {
              minesAround[other]++;
            }
            push(other);
          }
        }
      }
      knownMines = minesAround[index];
    }

    if (knownMines === number) {
      for (let k = begin; k < end; k++) {
        const neighbour = adjacency[k];
        if (knownSafe[neighbour] === 1 || knownMine[neighbour] === 1) {
          continue;
        }
        knownSafe[neighbour] = 1;
        safeCount++;
        let mines = 0;
        for (let j = offsets[neighbour]; j < offsets[neighbour + 1]; j++) {
          if (knownMine[adjacency[j]] === 1) {
            mines++;
          }
        }
        minesAround[neighbour] = mines;
        for (let j = offsets[neighbour]; j < offsets[neighbour + 1]; j++) {
          const other = adjacency[j];
          if (unknown[other] > 0) {
            unknown[other]--;
          }
          if (knownSafe[other] === 1) {
            push(other);
          }
        }
        push(neighbour);
      }
    }

    if (safeCount === n) {
      break;
    }
  }

  return { knownSafe, knownMine, safeCount };
}

export function isSolvable(
  geometry: Geometry,
  neighbourCounts: ArrayLike<number>,
  start: number,
  totalMines: number,
): boolean {
  const safeTotal = Math.max(0, geometry.count - totalMines);
  const outcome = solve(geometry, neighbourCounts, start);
  if (outcome.safeCount < safeTotal) {
    return false;
  }
  for (let i = 0; i < geometry.count; i++) {
    if (outcome.knownSafe[i] === 1 && outcome.knownMine[i] === 1) {
      return false;
    }
  }
  return true;
}
