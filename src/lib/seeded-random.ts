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
