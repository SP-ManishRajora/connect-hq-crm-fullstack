import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Coworking ERP",
  description: "Multi-center co-working ERP",
  // PWA (Phase 11.2) — Next serves src/app/manifest.ts at /manifest.webmanifest.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Housekeeping", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  // Inspections happen one-handed on a phone; allow pinch-zoom on a photograph
  // rather than locking the scale.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
