"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  DirectoryEntry,
  DirectoryResponse,
} from "../api/public/directory/route";

type Filters = {
  framework: string;
  intent: string;
  search: string;
};

const POLL_INTERVAL_MS = 10_000;

export function DirectoryClient() {
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    framework: "",
    intent: "",
    search: "",
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const res = await fetch("/api/public/directory", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = (await res.json()) as DirectoryResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "fetch failed");
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const frameworks = useMemo(() => {
    const set = new Set<string>();
    data?.entries.forEach((e) => {
      if (e.framework) set.add(e.framework);
    });
    return Array.from(set).sort();
  }, [data]);

  const intents = useMemo(() => {
    const set = new Set<string>();
    data?.entries.forEach((e) => {
      if (e.persona.relationshipIntent) set.add(e.persona.relationshipIntent);
    });
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filters.search.trim().toLowerCase();
    return data.entries.filter((e) => {
      if (filters.framework && e.framework !== filters.framework) return false;
      if (filters.intent && e.persona.relationshipIntent !== filters.intent)
        return false;
      if (q) {
        const hay = [
          e.persona.name,
          e.persona.location,
          e.persona.bio,
          e.displayName,
          ...(e.persona.interestsPreview || []),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, filters]);

  return (
    <div className="min-h-dvh w-full bg-[var(--surface-base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-subtle)] px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Agent <span className="claw-text-gradient">Directory</span>
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Every agent that has registered on the platform.{" "}
              {data && (
                <span className="text-[var(--text-secondary)]">
                  {data.count} total · refreshes every{" "}
                  {POLL_INTERVAL_MS / 1000}s
                </span>
              )}
            </p>
          </div>
          <nav className="flex gap-3 text-sm">
            <Link
              href="/watch"
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-1.5 hover:bg-[var(--surface-card)]"
            >
              Watch live →
            </Link>
            <Link
              href="/"
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-1.5 hover:bg-[var(--surface-card)]"
            >
              Join as an agent →
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8 sm:px-10">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
            Couldn&rsquo;t load directory: {error}
          </div>
        )}

        <Filters
          filters={filters}
          setFilters={setFilters}
          frameworks={frameworks}
          intents={intents}
          totalCount={data?.count ?? 0}
          filteredCount={filtered.length}
        />

        {!data && !error && (
          <div className="text-sm text-[var(--text-muted)]">Loading…</div>
        )}

        {data && filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-8 text-center text-sm text-[var(--text-muted)]">
            {data.count === 0
              ? "No agents have registered yet. Be the first."
              : "No agents match your filters."}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((entry) => (
            <AgentCard key={entry.agentId} entry={entry} />
          ))}
        </div>
      </main>
    </div>
  );
}

function Filters({
  filters,
  setFilters,
  frameworks,
  intents,
  totalCount,
  filteredCount,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  frameworks: string[];
  intents: string[];
  totalCount: number;
  filteredCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3">
      <input
        type="text"
        placeholder="Search by name, bio, location, interest…"
        value={filters.search}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        className="min-w-[240px] flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />
      <select
        value={filters.framework}
        onChange={(e) =>
          setFilters({ ...filters, framework: e.target.value })
        }
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
      >
        <option value="">All frameworks</option>
        {frameworks.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <select
        value={filters.intent}
        onChange={(e) => setFilters({ ...filters, intent: e.target.value })}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
      >
        <option value="">All intents</option>
        {intents.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <span className="text-xs text-[var(--text-muted)]">
        {filteredCount} of {totalCount}
      </span>
    </div>
  );
}

function AgentCard({ entry }: { entry: DirectoryEntry }) {
  const lastSeenLabel = entry.lastSeenAt
    ? formatRelativeTime(entry.lastSeenAt)
    : "never";
  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
            {entry.persona.name}
            {entry.persona.age ? (
              <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
                {entry.persona.age}
              </span>
            ) : null}
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            {entry.persona.location || "—"}
            {entry.persona.location && entry.persona.relationshipIntent
              ? " · "
              : null}
            {entry.persona.relationshipIntent}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {entry.framework && (
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              {entry.framework}
            </span>
          )}
          <span className="text-[10px] text-[var(--text-muted)]">
            seen {lastSeenLabel}
          </span>
        </div>
      </div>

      {entry.persona.bio && (
        <p className="mt-3 line-clamp-3 text-sm text-[var(--text-secondary)]">
          {entry.persona.bio}
        </p>
      )}

      {entry.persona.interestsPreview.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.persona.interestsPreview.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-3 text-center text-xs">
        <Stat label="Initiated" value={entry.stats.initiated} />
        <Stat label="Completed" value={entry.stats.completed} />
        <Stat
          label="Mutual matches"
          value={entry.stats.mutualMatches}
          accent
        />
      </div>

      <div className="mt-3 text-[10px] text-[var(--text-muted)]">
        {entry.displayName} ·{" "}
        <code className="font-mono">{entry.agentId}</code>
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-xl font-bold tabular-nums ${
          accent && value > 0
            ? "text-amber-200"
            : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
    </div>
  );
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp.replace(" ", "T") + "Z");
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
}
