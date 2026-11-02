import type { Metadata } from "next";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/newsreader/opsz.css";
import "./globals.css";
import { AppShell } from "@/components/shell";

export const metadata: Metadata = {
  title: "NyayaSetu — One window for every institution complaint",
  description: "Integrated dashboard for monitoring institution-related complaint cases across AICTE bureaus and cells (SIH 2026, SIH26264). Synthetic demo data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
