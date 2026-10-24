const MAX_CELLS = 65536;

export class Geometry {
  readonly rows: number;
  readonly cols: number;
  readonly count: number;
  readonly offsets: Uint32Array;
  readonly adjacency: Uint16Array;

  constructor(rows: number, cols: number) {
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows * cols > MAX_CELLS) {
      throw new RangeError('Invalid board size ' + String(rows) + 'x' + String(cols));
    }
    const count = rows * cols;
    const offsets = new Uint32Array(count + 1);
    const neighbours: number[] = [];
    for (let index = 0; index < count; index++) {
      const r = Math.floor(index / cols);
      const c = index - r * cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) {
            continue;
          }
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            neighbours.push(nr * cols + nc);
          }
        }
      }
      offsets[index + 1] = neighbours.length;
    }
    this.rows = rows;
    this.cols = cols;
    this.count = count;
    this.offsets = offsets;
    this.adjacency = Uint16Array.from(neighbours);
  }

  neighbours(index: number): Uint16Array {
    return this.adjacency.subarray(this.offsets[index], this.offsets[index + 1]);
  }

  degree(index: number): number {
    return this.offsets[index + 1] - this.offsets[index];
  }

  rowCol(index: number): [number, number] {
    const row = Math.floor(index / this.cols);
    return [row, index - row * this.cols];
  }

  chebyshev(a: number, b: number): number {
    const first = this.rowCol(a);
    const second = this.rowCol(b);
    return Math.max(Math.abs(first[0] - second[0]), Math.abs(first[1] - second[1]));
  }
}
