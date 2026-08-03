"use client";
import { useEffect, useRef, useState } from "react";

// QR scanning via the native BarcodeDetector API — no library dependency.
// Chrome/Edge on Android support it; iOS Safari does not, so a manual code entry
// is always offered rather than leaving those users stuck.
type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };

declare global {
  interface Window {
    BarcodeDetector?: new (o?: { formats?: string[] }) => Detector;
  }
}

export default function QrScanner({
  onScan,
  onCancel,
}: {
  onScan: (code: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const hasDetector = typeof window !== "undefined" && !!window.BarcodeDetector;
      setSupported(hasDetector);
      if (!hasDetector) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });

        const tick = async () => {
          if (doneRef.current || cancelled || !videoRef.current) return;
          try {
            const hits = await detector.detect(videoRef.current);
            const value = hits[0]?.rawValue?.trim();
            if (value) {
              doneRef.current = true;
              stop();
              onScan(extractCode(value));
              return;
            }
          } catch {
            // transient decode failure — keep scanning
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setError("Camera permission denied. Enter the code printed under the QR instead.");
      }
    }

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [onScan]);

  // QR may hold a full URL (/qr/<code>) or the bare code; accept either.
  function extractCode(v: string): string {
    try {
      const u = new URL(v);
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || v;
    } catch {
      return v;
    }
  }

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {supported && !error && (
        <div className="relative bg-black">
          <video ref={videoRef} playsInline muted className="w-full max-h-[60vh] object-cover" />
          {/* framing guide */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-56 h-56 border-4 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute bottom-3 inset-x-0 text-center text-white text-sm drop-shadow">
            Point the camera at the QR code on the wall
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {error && <div className="text-sm text-rose-700 bg-rose-50 rounded-md p-3">{error}</div>}
        {supported === false && (
          <div className="text-sm text-amber-800 bg-amber-50 rounded-md p-3">
            This browser can&apos;t scan QR codes directly (common on iPhone). Use your phone&apos;s
            camera app to open the QR link, or type the code printed under it.
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Enter code manually
          </label>
          <div className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="e.g. 8Kd2p_Qa91xZ"
              className="flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <button
              onClick={() => manual.trim() && onScan(manual.trim())}
              disabled={!manual.trim()}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              Go
            </button>
          </div>
        </div>

        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );
}
