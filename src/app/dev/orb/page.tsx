import type { Metadata } from "next";

import { OrbGallery } from "./OrbGallery";

/**
 * `/dev/orb` — the orb bench (APP-64).
 *
 * A development surface that ships with the app. It is marked `noindex` because
 * it is not a product page; it is not behind a flag because it has no side
 * effects, reads nothing, and is the surface `scripts/verify-orb.mjs` measures —
 * a check that can only run against a route the build actually produces.
 */
export const metadata: Metadata = {
  title: "Luna orb — dev bench",
  robots: { index: false, follow: false },
};

export default function OrbDevPage() {
  return <OrbGallery />;
}
