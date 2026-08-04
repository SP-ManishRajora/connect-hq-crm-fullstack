"use client";
import { useEffect, useState } from "react";

// Home-screen install prompt (Phase 11.2).
//
// Chrome/Edge on Android fire `beforeinstallprompt`, which we capture and
// re-fire from our own button — browsers ignore `prompt()` unless it follows a
// user gesture. iOS Safari has no such event, so those users get the manual
// Share → Add to Home Screen instruction instead of nothing.
//
// Dismissal is remembered so we never nag: this appears once, and only for
// people actually using the inspection screens.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "hk_install_dismissed";

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    // Already installed — nothing to offer.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's own mini-infobar; we show our own
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires the event, so detect it and show instructions instead.
    const ua = window.navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)) {
      setIosHint(true);
      setShow(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;   // accepted or dismissed — either way we're done
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 md:left-auto md:right-4 md:w-80">
      <div className="rounded-xl border bg-white shadow-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📱</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Add to your home screen</div>
            <p className="text-xs text-gray-500 mt-0.5">
              {iosHint
                ? "Tap the Share button, then “Add to Home Screen” — inspections open full-screen with the camera ready."
                : "Open inspections full-screen, straight from your home screen."}
            </p>
            <div className="flex gap-2 mt-3">
              {!iosHint && (
                <button
                  onClick={install}
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-xs text-white"
                >
                  Install
                </button>
              )}
              <button onClick={dismiss} className="rounded-md border px-3 py-1.5 text-xs">
                {iosHint ? "Got it" : "Not now"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
