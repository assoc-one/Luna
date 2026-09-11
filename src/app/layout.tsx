import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { semantic } from "@config/tokens";
import { Shell } from "@/components/Shell";
import "./globals.css";

/*
 * Space Grotesk carries display, Inter carries body.
 *
 * `next/font` self-hosts both faces out of `/_next/static/media`, emits a
 * `<link rel="preload">` for each, and generates a metric-matched fallback
 * (`adjustFontFallback`, on by default) so the pre-swap and post-swap renders
 * occupy the same space. Same-origin, preloaded and metrically matched is what
 * keeps the first paint from flashing or shifting — there is no request to
 * fonts.gstatic.com to lose.
 *
 * The variable names are declared in `config/tokens.ts` (`type.fontVariable`)
 * and the theme's `--font-display` / `--font-body` point at them. They are
 * repeated here as literals because `next/font` is a build-time transform and
 * rejects a non-literal option — `npm run check:design` fails if the two ever
 * stop agreeing.
 */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luna — Retirement Navigator",
  description:
    "A voice-first, adaptive retirement planning experience guided by Luna.",
};

export const viewport: Viewport = {
  // Matches the shell surface, so the browser chrome on a phone continues the
  // canvas instead of banding against it. Taken from the tokens rather than
  // written out — this is the one colour the CSS theme cannot supply, since the
  // browser reads it from a meta tag.
  themeColor: semantic.background,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
