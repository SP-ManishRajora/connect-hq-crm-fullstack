import type { MetadataRoute } from "next";

// PWA manifest (Phase 11.2). Next serves this at /manifest.webmanifest.
//
// Scope is the whole app, but `start_url` points at the inspection screen: the
// people who install this to their home screen are supervisors doing rounds on
// a phone, not managers reading dashboards on a laptop.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coworking ERP — Housekeeping",
    short_name: "Housekeeping",
    description:
      "QR inspections, corrective actions, generator monitoring and cleaning requests.",
    start_url: "/housekeeping/inspect",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // Maskable needs a safe zone so Android can crop it to any shape.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Start an inspection",
        short_name: "Inspect",
        url: "/housekeeping/inspect",
      },
      {
        name: "My tasks",
        short_name: "Tasks",
        url: "/housekeeping/tasks",
      },
    ],
  };
}
