import Link from "next/link";

export function AppHeader() {
  return (
    <header className="mb-6 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
      <Link
        href="/"
        className="touch-target flex items-center rounded-lg text-[var(--text-primary)] outline-none ring-offset-2 ring-offset-[var(--surface-base)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span className="sr-only">Clawnection home</span>
        <span className="text-lg font-semibold tracking-tight" aria-hidden="true">
          Claw<span className="text-[var(--text-muted)]">nection</span>
        </span>
      </Link>
    </header>
  );
}
