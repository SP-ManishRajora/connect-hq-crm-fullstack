"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// QR scanning uses the native BarcodeDetector API where available (Chrome/Edge on
// Android, ChromeOS). Everywhere else — desktop Chrome on Linux/Windows, iOS Safari —
// it is absent, so we decode camera frames with jsQR on a canvas instead. Manual code
// entry stays available as the last resort (no camera, permission denied).
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let cancelled = false;

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

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

    function hit(raw: string) {
      doneRef.current = true;
      stop();
      onScanRef.current(extractCode(raw.trim()));
    }

    // jsQR fallback: draw the current frame to an offscreen canvas and decode.
    function decodeFrame(video: HTMLVideoElement): string | null {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;

      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvasRef.current = canvas;
      }
      // Cap the decode resolution — full-res frames cost far more per tick without
      // improving the read on a wall-mounted code.
      const scale = Math.min(1, 640 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(data.data, data.width, data.height, {
        inversionAttempts: "dontInvert",
      });
      return found?.data ?? null;
    }

    // Poll the ref across animation frames until React has mounted the <video>.
    // Bounded so a render that never happens can't spin forever.
    function waitForVideo(): Promise<HTMLVideoElement | null> {
      return new Promise((resolve) => {
        let tries = 0;
        const look = () => {
          if (cancelled) return resolve(null);
          if (videoRef.current) return resolve(videoRef.current);
          if (++tries > 60) return resolve(null);
          requestAnimationFrame(look);
        };
        look();
      });
    }

    function waitForDimensions(video: HTMLVideoElement): Promise<void> {
      return new Promise((resolve) => {
        let tries = 0;
        const look = () => {
          if (cancelled || video.videoWidth > 0 || ++tries > 60) return resolve();
          requestAnimationFrame(look);
        };
        look();
      });
    }

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        // getUserMedia is absent entirely on insecure origins — the usual cause is the
        // page being served over plain http:// rather than the browser lacking support.
        const insecure =
          typeof window !== "undefined" &&
          !window.isSecureContext &&
          window.location.protocol !== "https:";
        setError(
          insecure
            ? "The camera needs a secure (https://) connection. Open this page over https, or type the code printed under the QR."
            : "This browser can't use the camera here. Type the code printed under the QR instead.",
        );
        return;
      }

      // Prefer the rear camera, but some devices reject an exact facingMode outright
      // (OverconstrainedError) instead of picking a fallback — so retry unconstrained
      // rather than telling the user their camera is unavailable.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e: unknown) {
        const name = (e as { name?: string })?.name ?? "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError(
            "Camera permission is blocked for this site. Allow it from the padlock icon in the address bar, then reload — or type the code printed under the QR.",
          );
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (e2: unknown) {
          const n2 = (e2 as { name?: string })?.name ?? "";
          setError(
            n2 === "NotReadableError"
              ? "The camera is in use by another app. Close it and reload, or type the code printed under the QR."
              : n2 === "NotFoundError"
                ? "No camera found on this device. Type the code printed under the QR instead."
                : "Couldn't start the camera. Type the code printed under the QR instead.",
          );
          return;
        }
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setScanning(true);

      // The <video> only mounts once `scanning` flips true, so the ref is still null
      // on this synchronous pass — wait for the element to exist before attaching.
      const video = await waitForVideo();
      if (!video || cancelled) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // autoplay rejection — the frame loop below still reads whatever renders
      }
      // jsQR needs real pixel dimensions; on a cold start they are 0 for a few frames.
      await waitForDimensions(video);
      if (cancelled) return;

      const detector = window.BarcodeDetector
        ? new window.BarcodeDetector({ formats: ["qr_code"] })
        : null;

      const tick = async () => {
        if (doneRef.current || cancelled || !videoRef.current) return;
        try {
          if (detector) {
            const hits = await detector.detect(videoRef.current);
            const value = hits[0]?.rawValue?.trim();
            if (value) return hit(value);
          } else {
            const value = decodeFrame(videoRef.current);
            if (value) return hit(value);
          }
        } catch {
          // transient decode failure — keep scanning
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {scanning && (
        <div className="relative bg-black overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full max-h-[60vh] object-cover"
          />
          {/* framing guide — the dimming spread is clipped by the parent's overflow-hidden */}
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
