const TWO_32 = 4294967296;
const LCG_A_HI = 0x5851f42d;
const LCG_A_LO = 0x4c957f2d;
const LCG_C_HI = 0x14057b7e;
const LCG_C_LO = 0xf767814f;
const ZERO_STATE_HI = 0x00000009;
const ZERO_STATE_LO = 0x87654321;
const MAX_RANGE = 0x200000;

export const UNIX_TO_APPLE_REFERENCE = 978307200;
export const NANAGOKYUU_SEED_MASK = 0x5a5a5a5a;

export function seedToHalves(seed: number): [number, number] {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('Seed must be a safe integer, got ' + String(seed));
  }
  const hi = Math.floor(seed / TWO_32);
  return [hi >>> 0, (seed - hi * TWO_32) >>> 0];
}

export class SeededRng {
  private hi: number;
  private lo: number;

  static fromSeed(seed: number): SeededRng {
    const halves = seedToHalves(seed);
    return new SeededRng(halves[0], halves[1]);
  }

  constructor(hi: number, lo: number) {
    this.hi = hi >>> 0;
    this.lo = lo >>> 0;
    if (this.hi === 0 && this.lo === 0) {
      this.hi = ZERO_STATE_HI;
      this.lo = ZERO_STATE_LO;
    }
  }

  nextPair(): [number, number] {
    this.step();
    return [this.hi, this.lo];
  }

  range(upper: number): number {
    if (!Number.isInteger(upper) || upper <= 0 || upper > MAX_RANGE) {
      throw new RangeError('Range upper bound out of bounds: ' + String(upper));
    }
    this.step();
    return ((this.hi % upper) * TWO_32 + this.lo) % upper;
  }

  chance(percent: number): boolean {
    return this.range(100) < percent;
  }

  private step(): void {
    const stateLo = this.lo;
    const stateHi = this.hi;
    const a0 = stateLo & 0xffff;
    const a1 = stateLo >>> 16;
    const b0 = LCG_A_LO & 0xffff;
    const b1 = LCG_A_LO >>> 16;
    const middle = a0 * b1 + a1 * b0;
    let lo = a0 * b0 + (middle % 65536) * 65536;
    const carry = Math.floor(lo / TWO_32);
    lo -= carry * TWO_32;
    let hi = a1 * b1 + Math.floor(middle / 65536) + carry;
    hi = (hi + Math.imul(stateHi, LCG_A_LO) + Math.imul(stateLo, LCG_A_HI)) >>> 0;
    lo += LCG_C_LO;
    if (lo >= TWO_32) {
      lo -= TWO_32;
      hi = (hi + LCG_C_HI + 1) >>> 0;
    } else {
      hi = (hi + LCG_C_HI) >>> 0;
    }
    this.hi = hi;
    this.lo = lo;
  }
}

export function generateEnvironmentalSeed(
  batteryPercent: number,
  nowMs: number = Date.now(),
  extraNanos: number = Math.floor(Math.random() * 1000000),
): number {
  const seconds = Math.floor(nowMs / 1000);
  const nanos = Math.floor((nowMs - seconds * 1000) * 1000000) + extraNanos;
  const battery = Math.min(100, Math.max(0, Math.trunc(batteryPercent) || 0));
  return ((seconds ^ nanos) >>> 0) + battery * 1145;
}

export function nowReferenceDate(nowMs: number = Date.now()): number {
  return nowMs / 1000 - UNIX_TO_APPLE_REFERENCE;
}

let idCounter = 1;

export function newRecordId(nowMs: number = Date.now()): string {
  const counter = idCounter++;
  const rng = new SeededRng(
    (Math.floor(nowMs / TWO_32) ^ counter) >>> 0,
    ((nowMs >>> 0) ^ Math.floor(Math.random() * TWO_32)) >>> 0,
  );
  const first = rng.nextPair();
  const second = rng.nextPair();
  const words = [first[0], first[1], second[0], second[1]];
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) {
      out += '-';
    }
    let value = (words[i >> 2] >>> (24 - (i & 3) * 8)) & 0xff;
    if (i === 6) {
      value = (value & 0x0f) | 0x40;
    } else if (i === 8) {
      value = (value & 0x3f) | 0x80;
    }
    out += (value < 16 ? '0' : '') + value.toString(16);
  }
  return out;
}
