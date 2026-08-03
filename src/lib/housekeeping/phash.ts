// Perceptual hashing for near-duplicate photo detection.
//
// Dependency-free on purpose: the repo has no image library, and adding sharp
// (native binary) or jimp (large) for one hash would be a heavy trade. This is a
// pure-JS average-hash over a decoded 8x8 luma grid.
//
// The DECODING is done client-side (canvas gives us pixels cheaply) and the
// resulting 64-bit hash is sent with the upload; the server stores and compares
// it. A tampered client can only forge its own hash — which is why exact sha256
// (computed server-side over the real bytes) remains the authoritative
// duplicate check, and pHash is the softer "looks similar" signal.

// Hamming distance between two hex-encoded hashes of equal length.
export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    // popcount of a nibble
    dist += ((x >> 3) & 1) + ((x >> 2) & 1) + ((x >> 1) & 1) + (x & 1);
  }
  return dist;
}

// ≤ this many differing bits (of 64) counts as "the same picture".
// 5 is conservative: it catches re-encodes and light crops without flagging two
// honest photos of the same clean bathroom wall.
export const PHASH_DUPLICATE_THRESHOLD = 5;

export function isNearDuplicate(a: string, b: string, threshold = PHASH_DUPLICATE_THRESHOLD): boolean {
  return hammingHex(a, b) <= threshold;
}

export function isValidPhash(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{16}$/i.test(v);
}
