"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneShell } from "@/components/PhoneShell";
import { AppHeader } from "@/components/AppHeader";
import { loadProfile, saveSignals } from "@/lib/storage";
import type { WhatsAppSignals } from "@/lib/types/behavioral";

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "error"; message: string }
  | { status: "done"; signals: WhatsAppSignals };

function formatLatency(ms: number): string {
  if (ms === 0) return "\u2014";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `~${min} min`;
  return `~${Math.round(min / 60)}h`;
}

function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function UploadDataContent() {
  const router = useRouter();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [consent, setConsent] = useState(false);
  const [whatsappFiles, setWhatsappFiles] = useState<File[]>([]);
  const [messengerFiles, setMessengerFiles] = useState<File[]>([]);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const waInputRef = useRef<HTMLInputElement>(null);
  const fbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const profile = loadProfile();
    if (!profile) {
      router.replace("/review-profile");
      return;
    }
    setProfileId(profile.id);
    setUserName(profile.name ?? "");
  }, [router]);

  const allFiles = [...whatsappFiles, ...messengerFiles];
  const canUpload =
    userName.trim().length > 0 &&
    consent &&
    allFiles.length > 0 &&
    state.status !== "uploading";

  async function handleUpload() {
    if (!canUpload || !profileId) return;

    setState({ status: "uploading" });

    try {
      const formData = new FormData();
      formData.append("profileId", profileId);
      formData.append("userName", userName.trim());
      for (const file of allFiles) {
        formData.append("files", file);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        setState({
          status: "error",
          message: (body as { error?: string }).error ?? "Upload failed",
        });
        return;
      }

      const body = (await res.json()) as { signals: WhatsAppSignals };
      saveSignals(body.signals);
      setState({ status: "done", signals: body.signals });
    } catch (err) {
      setState({
        status: "error",
        message:
          err instanceof Error ? err.message : "Something went wrong",
      });
    }
  }

  if (!profileId) return null;

  return (
    <div className="flex flex-1 flex-col gap-6 pb-8">
      {/* Header */}
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Optional step
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Upload your chat data
        </h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Upload chat exports to extract communication patterns. Raw data is
          processed server-side and then discarded &mdash; only derived signals
          are stored.
        </p>
      </header>

      {/* Name input */}
      <label className="block text-sm text-[var(--text-secondary)]">
        Your name as it appears in chats
        <input
          className="input-obsidian mt-1"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="e.g. Maya, or +1 617-555-0100"
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Must match exactly how you appear as a sender in the export.
        </p>
      </label>

      {/* Upload sections */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* WhatsApp */}
        <div className="obsidian-card rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            WhatsApp
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Export a chat from WhatsApp &gt; More &gt; Export chat. Accepts
            .txt and .zip files.
          </p>
          <div
            className="cursor-pointer rounded-xl border-2 border-dashed border-[var(--glass-stroke)] p-5 text-center transition hover:border-[var(--radar-orange)]/50"
            onClick={() => waInputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) setWhatsappFiles((prev) => [...prev, ...files]);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              ref={waInputRef}
              type="file"
              accept=".txt,.zip"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) setWhatsappFiles((prev) => [...prev, ...files]);
                e.target.value = "";
              }}
            />
            <p className="text-sm text-[var(--text-secondary)]">
              Drop files or click to select
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">.txt or .zip</p>
          </div>
          {whatsappFiles.length > 0 && (
            <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
              {whatsappFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    className="shrink-0 text-[var(--text-muted)] hover:text-[var(--radar-pink)]"
                    onClick={() =>
                      setWhatsappFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    aria-label={`Remove ${f.name}`}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* FB Messenger */}
        <div className="obsidian-card rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            FB Messenger
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Download your data from Facebook Settings &gt; Your Information
            &gt; Download Your Information, select Messages in JSON format.
            Accepts .json files.
          </p>
          <div
            className="cursor-pointer rounded-xl border-2 border-dashed border-[var(--glass-stroke)] p-5 text-center transition hover:border-[var(--radar-orange)]/50"
            onClick={() => fbInputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) setMessengerFiles((prev) => [...prev, ...files]);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              ref={fbInputRef}
              type="file"
              accept=".json"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) setMessengerFiles((prev) => [...prev, ...files]);
                e.target.value = "";
              }}
            />
            <p className="text-sm text-[var(--text-secondary)]">
              Drop files or click to select
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">.json</p>
          </div>
          {messengerFiles.length > 0 && (
            <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
              {messengerFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    className="shrink-0 text-[var(--text-muted)] hover:text-[var(--radar-pink)]"
                    onClick={() =>
                      setMessengerFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    aria-label={`Remove ${f.name}`}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Consent */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--glass-stroke)] bg-[var(--glass-fill)] px-3 py-3 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded"
        />
        <span>
          I understand my chat data will be processed to extract communication
          patterns only. Raw messages are never stored.
        </span>
      </label>

      {/* Upload button */}
      <button
        type="button"
        disabled={!canUpload}
        onClick={handleUpload}
        className="primary-button w-full touch-target disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state.status === "uploading" ? "Analyzing..." : "Analyze my chats"}
      </button>

      {/* Error */}
      {state.status === "error" && (
        <div
          className="rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {state.message}
        </div>
      )}

      {/* Signal preview */}
      {state.status === "done" && (
        <div className="obsidian-card rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-emerald-200">
              Your data has been analyzed
            </span>
            {state.signals.isLowConfidence && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-100 ring-1 ring-amber-400/30">
                Low confidence &mdash; results may be less accurate
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-[var(--text-muted)]">Communication style</p>
              <p className="font-medium text-[var(--text-primary)] capitalize">
                {state.signals.derivedCommunicationStyle}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Avg response time</p>
              <p className="font-medium text-[var(--text-primary)]">
                {formatLatency(state.signals.avgResponseLatencyMs)}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Initiation ratio</p>
              <p className="font-medium text-[var(--text-primary)]">
                {formatPct(state.signals.initiationRatio)}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Emoji density</p>
              <p className="font-medium text-[var(--text-primary)]">
                {formatPct(state.signals.emojiDensity)}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Messages analyzed</p>
              <p className="font-medium text-[var(--text-primary)]">
                {state.signals.totalMessages.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Your messages</p>
              <p className="font-medium text-[var(--text-primary)]">
                {state.signals.userMessageCount.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-col gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push("/demo")}
          className="primary-button w-full touch-target text-center"
        >
          Continue to matching
        </button>
        <button
          type="button"
          onClick={() => router.push("/demo")}
          className="secondary-button w-full touch-target text-center"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

export default function UploadDataPage() {
  return (
    <PhoneShell>
      <AppHeader />
      <UploadDataContent />
    </PhoneShell>
  );
}
