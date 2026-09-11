"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The application shell. Every route renders inside it — it is mounted once in
 * the root layout (`src/app/layout.tsx`) rather than per page, so "every page
 * uses the Shell" is a property of the route tree and not a convention anyone
 * has to remember.
 *
 * Shape: a 390px column (`--container-shell`) that is the entire viewport on a
 * phone and a centred column on a backdrop above `--breakpoint-frame`. Both
 * numbers are tokens; see `config/tokens.ts`.
 *
 * It is a Client Component for one reason — `usePathname`, which keys the
 * transition wrapper so a route change replays the enter animation. `children`
 * arrives as already-rendered Server Component output and is passed straight
 * through, which is the supported arrangement: nothing here is serialised
 * across the boundary except the nodes themselves.
 */
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-backdrop flex min-h-dvh justify-center">
      <div className="app-shell flex min-h-dvh w-full max-w-shell flex-col frame:border-x frame:border-border frame:shadow-shell">
        {/*
          Keyed on the pathname: React unmounts and remounts the subtree on a
          route change, which restarts the CSS animation. `prefers-reduced-motion`
          is honoured in globals.css, at the point of use.
        */}
        <div key={pathname} className="page-enter flex flex-1 flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Shell;
