"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white whitespace-nowrap"
    >
      Print
    </button>
  );
}
