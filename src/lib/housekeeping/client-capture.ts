"use client";

// Browser-side capture helpers: device identity, GPS, image quality scoring and
// perceptual hashing. Kept out of the components so the inspect screen stays
// readable and these can be unit-tested independently.

const DEVICE_KEY = "hk_device_id";

// Stable per-browser id. Not a security control — it exists so "supervisor
// switched phones mid-round" is detectable. Real device attestation isn't
// available to a web app.
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export type Fix = { lat: number; lng: number; accuracyM: number } | null;

export function getPosition(timeoutMs = 12000): Promise<Fix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: p.coords.accuracy,
        }),
      // A refused or failed fix must not block the inspection; the server
      // records a NO_GPS flag instead.
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
    );
  });
}

async function toBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

export type QualityReport = {
  score: number;          // 0–100, higher is better
  problems: string[];     // human-readable retake reasons
  pHash: string | null;
};

// Analyses the photo entirely on-device: mean luminance for dark/bright, a
// Laplacian-style neighbour delta for blur, and an 8x8 average hash.
export async function analyseImage(file: File): Promise<QualityReport> {
  const bmp = await toBitmap(file);
  if (!bmp) return { score: 50, problems: [], pHash: null };

  const problems: string[] = [];

  // --- downscale once, reuse for every metric ---
  const W = 64;
  const H = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { score: 50, problems: [], pHash: null };
  ctx.drawImage(bmp, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const luma = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const mean = luma.reduce((a, b) => a + b, 0) / luma.length;

  // Exposure
  if (mean < 40) problems.push("Photo is too dark — turn on more light");
  else if (mean > 225) problems.push("Photo is overexposed — avoid pointing at a bright light");

  // Blur / covered lens: variance of the neighbour difference.
  let acc = 0;
  let n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const lap =
        4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - W] - luma[i + W];
      acc += lap * lap;
      n++;
    }
  }
  const sharpness = Math.sqrt(acc / Math.max(1, n));

  if (sharpness < 3) problems.push("Photo looks blurred or the camera is covered — hold steady and retake");
  else if (sharpness < 6) problems.push("Photo looks slightly blurred");

  // Score: exposure closeness to mid-grey + sharpness, both clamped.
  const exposureScore = 100 - Math.min(100, (Math.abs(mean - 128) / 128) * 100);
  const sharpScore = Math.min(100, (sharpness / 20) * 100);
  const score = Math.round(exposureScore * 0.4 + sharpScore * 0.6);

  return { score, problems, pHash: averageHash(luma, W, H) };
}

// 8x8 average hash → 16 hex chars (64 bits). Matches the comparison in
// lib/housekeeping/phash.ts.
function averageHash(luma: Float64Array, W: number, H: number): string {
  const S = 8;
  const cell = new Float64Array(S * S);
  const bw = Math.floor(W / S);
  const bh = Math.floor(H / S);

  for (let by = 0; by < S; by++) {
    for (let bx = 0; bx < S; bx++) {
      let sum = 0;
      let count = 0;
      for (let y = by * bh; y < (by + 1) * bh; y++) {
        for (let x = bx * bw; x < (bx + 1) * bw; x++) {
          sum += luma[y * W + x];
          count++;
        }
      }
      cell[by * S + bx] = count ? sum / count : 0;
    }
  }

  const avg = cell.reduce((a, b) => a + b, 0) / cell.length;
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    let nib = 0;
    for (let b = 0; b < 4; b++) nib = (nib << 1) | (cell[i + b] > avg ? 1 : 0);
    hex += nib.toString(16);
  }
  return hex;
}
