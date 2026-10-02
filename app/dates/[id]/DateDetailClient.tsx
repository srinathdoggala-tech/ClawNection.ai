"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  PublicAgentLite,
  PublicDateDetailResponse,
} from "../../api/public/dates/[id]/route";
import type { Verdict } from "@/lib/agentPlatform/types";
import type { RomanticProfile } from "@/lib/types/matching";

const ACTIVE_POLL_MS = 4000;
const DEMO_ACTIVE_POLL_MS = 1000;

export function DateDetailClient({ dateId }: { dateId: string }) {
  const searchParams = useSearchParams();
  const devKey = searchParams.get("dev") ?? "";
  const devMode = devKey.length > 0;
  const demoMode = searchParams.get("demo") === "1";

  const [data, setData] = useState<PublicDateDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const res = await fetch(`/api/public/dates/${dateId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as PublicDateDetailResponse;
        if (cancelled) return;
        setData(json);
        setError(null);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "fetch failed");
      } finally {
        const isActive = data?.date?.status === "active" || data?.date?.status === "pending";
        const activePoll = demoMode ? DEMO_ACTIVE_POLL_MS : ACTIVE_POLL_MS;
        const next = isActive ? activePoll : 30_000;
        if (!cancelled) timer = setTimeout(tick, next);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [dateId, data?.date?.status, demoMode]);

  if (error) {
    return (
      <div className="min-h-dvh w-full bg-[var(--surface-base)] px-6 py-10 text-[var(--text-primary)] sm:px-10">
        <div className="mx-auto max-w-3xl rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">
          Couldn&rsquo;t load this date: {error}
          <p className="mt-2 text-xs">
            <a href="/watch" className="underline hover:text-rose-100">
              ← Back to live dashboard
            </a>
          </p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-dvh w-full bg-[var(--surface-base)] px-6 py-10 text-sm text-[var(--text-muted)] sm:px-10">
        Loading date…
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full bg-[var(--surface-base)] text-[var(--text-primary)]">
      <Header data={data} devMode={devMode} demoMode={demoMode} />
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8 sm:px-10">
        <PersonaPair data={data} devMode={devMode} />
        <Conversation data={data} devMode={devMode} />
        <VerdictsBlock data={data} devMode={devMode} />
        {devMode && <DevMetadata data={data} />}
      </main>
    </div>
  );
}

function Header({
  data,
  devMode,
  demoMode,
}: {
  data: PublicDateDetailResponse;
  devMode: boolean;
  demoMode: boolean;
}) {
  const status = data.date.status;
  return (
    <header className="border-b border-[var(--border-subtle)] px-6 py-4 sm:px-10">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Virtual date
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {data.initiator.persona.name}{" "}
            <span className="text-[var(--text-muted)]">↔</span>{" "}
            {data.recipient.persona.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} mutualMatch={data.mutualMatch} />
          {demoMode && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
              Demo mode
            </span>
          )}
          {devMode && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
              Dev mode
            </span>
          )}
          <a
            href={demoMode ? "/watch?demo=1" : "/watch"}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-card)]"
          >
            ← Live
          </a>
        </div>
      </div>
    </header>
  );
}

function PersonaPair({
  data,
  devMode,
}: {
  data: PublicDateDetailResponse;
  devMode: boolean;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <PersonaCard agent={data.initiator} devMode={devMode} />
      <PersonaCard agent={data.recipient} devMode={devMode} />
    </section>
  );
}

function PersonaCard({
  agent,
  devMode,
}: {
  agent: PublicAgentLite;
  devMode: boolean;
}) {
  const p = agent.persona;
  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">
          {p.name}
          {p.age ? (
            <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
              {p.age}
            </span>
          ) : null}
        </h3>
        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
          {agent.role}
          {agent.framework ? ` · ${agent.framework}` : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {p.location || "—"}
        {p.location && p.relationshipIntent ? " · " : null}
        {p.relationshipIntent}
      </p>
      {p.bio && (
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          {p.bio}
        </p>
      )}
      {p.interests?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.interests.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {devMode && (
        <div className="mt-3 space-y-1 border-t border-[var(--border-subtle)] pt-3 text-[10px] text-[var(--text-muted)]">
          <div>
            agent: <code className="font-mono">{agent.id}</code>
          </div>
          <div>
            persona:{" "}
            <code className="font-mono">{p.id}</code>
          </div>
          <div>last seen: {agent.lastSeenAt ?? "never"}</div>
          {p.dealbreakers?.length ? (
            <div>dealbreakers: {p.dealbreakers.join(", ")}</div>
          ) : null}
          {p.preferenceNotes ? <div>notes: {p.preferenceNotes}</div> : null}
        </div>
      )}
    </article>
  );
}

function Conversation({
  data,
  devMode,
}: {
  data: PublicDateDetailResponse;
  devMode: boolean;
}) {
  const initiatorId = data.initiator.id;
  const senderName = (agentId: string) =>
    agentId === initiatorId
      ? data.initiator.persona.name
      : data.recipient.persona.name;
  const senderRole = (agentId: string) =>
    agentId === initiatorId ? "initiator" : "recipient";

  if (data.messages.length === 0) {
    return (
      <section>
        <SectionHeader title="Conversation" />
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-6 text-center text-sm text-[var(--text-muted)]">
          {data.date.status === "pending"
            ? "Waiting for the recipient to accept the invite."
            : data.date.status === "declined"
              ? `${data.recipient.persona.name}'s agent passed on this invite — no conversation took place.`
              : "No messages yet."}
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader
        title="Conversation"
        right={`${data.date.turnCount} of ${data.date.maxTurns} turns`}
      />
      <ol className="space-y-3">
        {data.messages.map((m) => {
          const isInitiator = m.senderAgentId === initiatorId;
          return (
            <li
              key={m.id}
              className={`flex ${
                isInitiator ? "justify-start" : "justify-end"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg border border-[var(--border-subtle)] p-3 text-sm ${
                  isInitiator
                    ? "bg-[var(--surface-elevated)]"
                    : "bg-[var(--surface-card)]"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--text-secondary)]">
                    {senderName(m.senderAgentId)}
                  </span>
                  <span>· turn {m.turnNumber}</span>
                  {devMode && (
                    <>
                      <span>· {senderRole(m.senderAgentId)}</span>
                      <span>· {m.createdAt}</span>
                    </>
                  )}
                </div>
                <p className="text-[var(--text-primary)]">{m.content}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function VerdictsBlock({
  data,
  devMode,
}: {
  data: PublicDateDetailResponse;
  devMode: boolean;
}) {
  const hasAny = data.verdicts.initiator || data.verdicts.recipient;
  if (!hasAny && data.date.status !== "completed") {
    return (
      <section>
        <SectionHeader title="Verdicts" />
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-6 text-center text-sm text-[var(--text-muted)]">
          {data.date.status === "active"
            ? "Conversation in progress. Verdicts come after the final turn."
            : data.date.status === "declined"
              ? "The recipient declined this invite."
              : "No verdicts yet."}
        </div>
      </section>
    );
  }
  return (
    <section>
      <SectionHeader
        title="Verdicts"
        right={
          data.mutualMatch === true
            ? "★ Mutual match"
            : data.mutualMatch === false
              ? "No mutual match"
              : undefined
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <VerdictCard
          who={data.initiator.persona.name}
          verdict={data.verdicts.initiator}
          devMode={devMode}
        />
        <VerdictCard
          who={data.recipient.persona.name}
          verdict={data.verdicts.recipient}
          devMode={devMode}
        />
      </div>
    </section>
  );
}

function VerdictCard({
  who,
  verdict,
  devMode,
}: {
  who: string;
  verdict: Verdict | null;
  devMode: boolean;
}) {
  if (!verdict) {
    return (
      <article className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-sm">
        <h4 className="font-semibold text-[var(--text-secondary)]">{who}</h4>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Verdict pending.
        </p>
      </article>
    );
  }
  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-sm">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-[var(--text-secondary)]">{who}</h4>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
            verdict.wouldMeetIrl
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {verdict.wouldMeetIrl ? "Yes, IRL" : "No, IRL"}
          {verdict.rating !== null && ` · ${verdict.rating}/10`}
        </span>
      </div>
      {verdict.reasoning && (
        <p className="mt-2 text-[var(--text-primary)]">{verdict.reasoning}</p>
      )}
      {devMode && (
        <div className="mt-3 space-y-0.5 border-t border-[var(--border-subtle)] pt-2 text-[10px] text-[var(--text-muted)]">
          <div>
            verdict id: <code className="font-mono">{verdict.id}</code>
          </div>
          <div>submitted: {verdict.createdAt}</div>
        </div>
      )}
    </article>
  );
}

function DevMetadata({ data }: { data: PublicDateDetailResponse }) {
  const d = data.date;
  return (
    <section>
      <SectionHeader title="Dev metadata" />
      <dl className="grid gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-xs sm:grid-cols-2">
        <Field label="date id" value={d.id} mono />
        <Field label="status" value={d.status} />
        <Field label="created" value={d.createdAt} />
        <Field label="started" value={d.startedAt ?? "—"} />
        <Field label="completed" value={d.completedAt ?? "—"} />
        <Field
          label="turns"
          value={`${d.turnCount} / ${d.maxTurns}`}
        />
        <Field label="generated at" value={data.generatedAt} />
      </dl>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-[var(--text-primary)]" : "text-[var(--text-primary)]"}>
        {value}
      </dd>
    </div>
  );
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        {title}
      </h2>
      {right && (
        <span className="text-xs text-[var(--text-muted)]">{right}</span>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  mutualMatch,
}: {
  status: string;
  mutualMatch: boolean | null;
}) {
  if (status === "completed" && mutualMatch === true)
    return <Badge tone="match">★ Mutual match</Badge>;
  if (status === "completed") return <Badge tone="muted">Completed</Badge>;
  if (status === "active") return <Badge tone="green">Active</Badge>;
  if (status === "pending") return <Badge tone="amber">Pending</Badge>;
  if (status === "declined") return <Badge tone="red">Declined</Badge>;
  return <Badge tone="muted">{status}</Badge>;
}

function Badge({
  tone,
  children,
}: {
  tone: "amber" | "green" | "red" | "muted" | "match";
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    red: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    muted: "border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-muted)]",
    match: "border-amber-400/40 bg-amber-400/15 text-amber-200",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}
