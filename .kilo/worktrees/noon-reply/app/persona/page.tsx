"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PhoneShell } from "@/components/PhoneShell";
import { loadProfile } from "@/lib/storage";
import { VoicePersona } from "@/lib/types/persona";
import {
  ONBOARDING_HREF,
  VOICE_ONBOARDING_ENABLED,
} from "@/lib/featureFlags";

const MAX_POLLS = 12;
const POLL_INTERVAL_MS = 5000;

async function fetchPersona(profileId: string): Promise<VoicePersona | null> {
  const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/persona`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<VoicePersona>;
}

function renderSignals(raw: string) {
  if (!raw) return null;
  return raw.split("\n").map((line, i) => {
    if (/^##\s/.test(line)) {
      return <h3 key={i} className="mt-4 text-sm font-black uppercase tracking-widest text-white/48">{line.replace(/^##\s/, "")}</h3>;
    }
    if (/^\*\*(.+)\*\*/.test(line)) {
      const match = line.match(/^\*\*(.+?)\*\*[:\s]*(.*)/);
      return (
        <p key={i} className="mt-2 text-sm leading-6 text-white/80">
          <span className="font-bold text-white">{match?.[1]}</span>
          {match?.[2] ? `: ${match[2]}` : ""}
        </p>
      );
    }
    if (/^[-•]/.test(line)) {
      return <p key={i} className="mt-1 pl-3 text-sm leading-6 text-white/72 before:mr-2 before:content-['·']">{line.replace(/^[-•]\s*/, "")}</p>;
    }
    if (line.trim() === "") return null;
    return <p key={i} className="mt-2 text-sm leading-6 text-white/66">{line}</p>;
  });
}

function renderVoiceSamples(raw: string) {
  if (!raw) return null;
  const lines = raw.split("\n").filter((l) => l.trim());
  return lines.map((line, i) => {
    const text = line.replace(/^\d+[\.\)]\s*/, "").replace(/^[""]|[""]$/g, "");
    return (
      <li key={i} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/80">
        &ldquo;{text}&rdquo;
      </li>
    );
  });
}

export default function PersonaPage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [persona, setPersona] = useState<VoicePersona | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.title = "Your persona · Clawnection";
    const params = new URLSearchParams(window.location.search);
    const id = params.get("profileId") ?? loadProfile()?.id ?? null;
    setProfileId(id);
  }, []);

  useEffect(() => {
    if (!profileId) return;

    let cancelled = false;

    async function poll(attempt: number) {
      try {
        const result = await fetchPersona(profileId!);
        if (cancelled) return;

        if (result) {
          setPersona(result);
          return;
        }

        if (attempt >= MAX_POLLS) {
          setTimedOut(true);
          return;
        }

        setPollCount(attempt + 1);
        pollRef.current = setTimeout(() => poll(attempt + 1), POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load persona");
      }
    }

    void poll(0);

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [profileId]);

  const isLoading = !persona && !timedOut && !error;

  return (
    <PhoneShell>
      <main className="screen-padding space-y-6">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-white/58">Clawnection</Link>
          <p className="pill w-fit">Your persona</p>
          <h1 className="text-4xl font-black leading-none tracking-[-0.045em] text-white">
            How your agent sees you
          </h1>
        </header>

        {isLoading && (
          <div className="obsidian-card rounded-[28px] p-5 space-y-3">
            <p className="text-sm font-bold text-white">Processing your call…</p>
            <p className="text-sm text-white/54">
              {pollCount === 0
                ? "Waiting for VAPI to send the analysis."
                : `Checking again… (${pollCount}/${MAX_POLLS})`}
            </p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white/40 transition-all duration-500"
                style={{ width: `${Math.round((pollCount / MAX_POLLS) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-[28px] border border-red-400/30 bg-red-500/10 p-5">
            <p className="text-sm font-bold text-red-300">Error loading persona</p>
            <p className="mt-1 text-sm text-white/54">{error}</p>
          </div>
        )}

        {timedOut && !persona && (
          <div className="rounded-[28px] border border-amber-300/25 bg-amber-400/10 p-5">
            <p className="text-sm font-bold text-white">Still processing</p>
            <p className="mt-1 text-sm text-white/66">
              VAPI hasn&apos;t sent the analysis yet. Try refreshing in a minute.
            </p>
          </div>
        )}

        {persona && (
          <>
            {persona.analysis_skipped && (
              <div className="rounded-[28px] border border-amber-300/25 bg-amber-400/10 p-5">
                <p className="text-sm text-white/66">
                  The call was too short for a full analysis — showing what was captured.
                </p>
              </div>
            )}

            {persona.portrait && (
              <section aria-labelledby="portrait-title" className="obsidian-card rounded-[28px] p-5 space-y-3">
                <h2 id="portrait-title" className="text-lg font-black text-white">Portrait</h2>
                <p className="text-sm leading-7 text-white/72">{persona.portrait}</p>
              </section>
            )}

            {persona.structured_signals && (
              <section aria-labelledby="signals-title" className="obsidian-card rounded-[28px] p-5 space-y-1">
                <h2 id="signals-title" className="text-lg font-black text-white">Structured signals</h2>
                {renderSignals(persona.structured_signals)}
              </section>
            )}

            {persona.voice_samples && (
              <section aria-labelledby="samples-title" className="space-y-3">
                <h2 id="samples-title" className="text-2xl font-black tracking-tight text-white">Voice samples</h2>
                <ul className="space-y-2">
                  {renderVoiceSamples(persona.voice_samples)}
                </ul>
              </section>
            )}

            {!persona.portrait && persona.transcript && (
              <section aria-labelledby="transcript-title" className="obsidian-card rounded-[28px] p-5 space-y-3">
                <h2 id="transcript-title" className="text-lg font-black text-white">Call transcript</h2>
                <p className="text-xs text-white/44 mb-2">AI analysis not configured — showing raw transcript.</p>
                <pre className="text-sm leading-6 text-white/72 whitespace-pre-wrap font-sans">{persona.transcript}</pre>
              </section>
            )}

            {persona.call_duration_seconds && (
              <p className="text-xs text-white/32 text-center">
                Call duration: {Math.round(persona.call_duration_seconds / 60)} min
                {persona.ended_reason ? ` · ${persona.ended_reason}` : ""}
              </p>
            )}
          </>
        )}

        <div className="grid gap-3 pt-2">
          <Link href={`/demo${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`} className="primary-button">
            Run a virtual date
          </Link>
          <Link href={ONBOARDING_HREF} className="secondary-button">
            {VOICE_ONBOARDING_ENABLED ? "Redo voice onboarding" : "Edit profile"}
          </Link>
        </div>
      </main>
    </PhoneShell>
  );
}
