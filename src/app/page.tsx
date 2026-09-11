export default function Home() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-5 px-6 py-16">
      <p className="font-display text-xs font-medium uppercase tracking-widest text-accent">
        Luna
      </p>

      <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-foreground text-balance">
        Retirement Navigator
      </h1>

      <p className="text-lg leading-relaxed text-muted text-pretty">
        A voice-first, adaptive retirement planning experience. The scaffold is
        standing; the experience is not built yet.
      </p>

      <p className="border-t border-border pt-5 text-sm leading-normal text-muted text-pretty">
        Phase 0 — foundation. This route exists to prove the app builds and
        renders, and now that it does so inside the shell, that the design
        tokens reach the page.
      </p>
    </main>
  );
}
