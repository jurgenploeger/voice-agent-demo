import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Agents",
  description: "A voice-agent UI demo.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // GeistSans (the full Vercel font) carries the stylistic alternates the
  // GoogleFonts subset lacks; --font-geist-sans is its CSS variable.
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
