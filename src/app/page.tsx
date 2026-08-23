export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <main className="flex w-full max-w-xl flex-col gap-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
          Luna
        </p>

        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance">
          Retirement Navigator
        </h1>

        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          A voice-first, adaptive retirement planning experience. The scaffold is
          standing; the experience is not built yet.
        </p>

        <p className="text-sm leading-6 text-zinc-500">
          Phase 0 — foundation. This route exists to prove the app builds and
          renders.
        </p>
      </main>
    </div>
  );
}
