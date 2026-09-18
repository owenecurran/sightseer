// Deterministic cosmetic randomness.
//
// Everything randomized in this app's artwork — a stamp's tilt, which
// design it draws, which sticker variant an arrow uses — has to stay put
// across re-renders, re-scrolls and app launches. Math.random() reshuffles
// the feed's stamps every time a row recycles, which reads as the page
// glitching rather than as variety. Seeding off something stable per item
// (the visit id) gives each post its own fixed draw instead.
//
// Not cryptographic and does not need to be.

// FNV-1a. Turns a string seed into the 32-bit integer mulberry32 wants.
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A two-way draw, mixed before it is used.
//
// `hashSeed(seed) % 2` is the hash's LOWEST BIT, and FNV-1a leaves that bit
// XOR-linear in the seed's characters: it multiplies by an odd prime, and an
// odd multiply preserves parity. Two such draws over the same id are
// therefore perfectly correlated — their low bits differ by a constant that
// depends only on the two prefixes. Measured, not assumed: over 200,000 ids
// the low bits of two different prefixes agreed every single time.
//
// That makes any pair of coin flips on one item secretly the same flip. The
// region line needs two — above or below, and which margin — and without
// this they would only ever produce two of their four combinations.
//
// mulberry32 mixes the whole hash, so the bit actually varies.
export function pickOneOfTwo<T>(seed: string, a: T, b: T): T {
  return mulberry32(hashSeed(seed))() < 0.5 ? a : b;
}

// mulberry32 — small, fast, and good enough for this.
export function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The common case: a fresh stream for a string seed.
export function randomFor(seed: string): () => number {
  return mulberry32(hashSeed(seed));
}

// Picks one item deterministically. Returns undefined for an empty list
// rather than NaN-indexing, so a caller with no variants registered yet can
// fall back cleanly.
export function pickFor<T>(seed: string, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(randomFor(seed)() * items.length)];
}
