import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coworking ERP",
  description: "Multi-center co-working ERP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
