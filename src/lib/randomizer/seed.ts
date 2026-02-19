/**
 * Mulberry32 - deterministic 32-bit PRNG
 * Returns a function that produces numbers in [0, 1)
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeededRNG {
  next(): number;
  randInt(min: number, max: number): number;
  shuffle<T>(array: T[]): T[];
}

export function createRNG(seed: number): SeededRNG {
  const rng = mulberry32(seed);

  return {
    next: rng,
    randInt(min: number, max: number): number {
      return min + Math.floor(rng() * (max - min + 1));
    },
    shuffle<T>(array: T[]): T[] {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/**
 * Convert a string seed to a 32-bit integer
 */
export function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}
