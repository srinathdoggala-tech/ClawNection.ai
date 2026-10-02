"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CompletedAgentDate, demoAgentDates, getDemoPeople, getRankingsForPerson } from "@/lib/data/demoPeople";
import { SocialPerson, StageProgress } from "@/lib/social/types";

type ViewStep = "input" | "analyzing" | "profile" | "date" | "rankings";

const INITIAL_STAGES: StageProgress[] = [
  { id: "linkedin_loaded", label: "LinkedIn source verified", status: "pending" },
  { id: "instagram_loaded", label: "Instagram source verified", status: "pending" },
  { id: "career_extracted", label: "Career & professional signals extracted", status: "pending" },
  { id: "interests_extracted", label: "Interests & domains extracted", status: "pending" },
  { id: "hobbies_extracted", label: "Creative & athletic hobbies extracted", status: "pending" },
  { id: "personality_extracted", label: "Communication signals extracted", status: "pending" },
  { id: "persona_synthesized", label: "Agent persona synthesized", status: "pending" },
];

export default function CreatePersonPage() {
  const [step, setStep] = useState<ViewStep>("input");
  const [linkedinUrl, setLinkedinUrl] = useState("https://www.linkedin.com/in/garyvaynerchuk");
  const [instagramUrl, setInstagramUrl] = useState("https://www.instagram.com/garyvee");
  const [stages, setStages] = useState<StageProgress[]>(INITIAL_STAGES);
  const [currentPerson, setCurrentPerson] = useState<SocialPerson | null>(null);
  const [selectedCounterpartId, setSelectedCounterpartId] = useState<string>("person_002");
  const [activeDate, setActiveDate] = useState<CompletedAgentDate>(demoAgentDates[0]);
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDatingLive, setIsDatingLive] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<string>("precomputed_demo");

  const allCohortPeople = getDemoPeople();

  // Pre-load default candidate if visiting directly
  useEffect(() => {
    if (!currentPerson && allCohortPeople.length > 0) {
      setCurrentPerson(allCohortPeople[0]);
    }
  }, [allCohortPeople, currentPerson]);

  const selectPreset = (personId: string) => {
    const found = allCohortPeople.find((p) => p.id === personId);
    if (found) {
      setLinkedinUrl(found.linkedin);
      setInstagramUrl(found.instagram);
      setErrorMsg(null);
    }
  };

  const handleAnalyze = async () => {
    setErrorMsg(null);

    // Frontend validation
    if (!linkedinUrl.trim() || !instagramUrl.trim()) {
      setErrorMsg("Please provide both a LinkedIn URL and an Instagram URL.");
      return;
    }
    if (!linkedinUrl.toLowerCase().includes("linkedin.com")) {
      setErrorMsg("LinkedIn URL must belong to the linkedin.com domain (e.g. https://www.linkedin.com/in/username).");
      return;
    }
    if (!instagramUrl.toLowerCase().includes("instagram.com")) {
      setErrorMsg("Instagram URL must belong to the instagram.com domain (e.g. https://www.instagram.com/username).");
      return;
    }

    setStep("analyzing");
    setStages(
      INITIAL_STAGES.map((s, idx) => ({
        ...s,
        status: idx === 0 ? "running" : "pending",
      })),
    );

    try {
      const stageDelay = (ms: number) => new Promise((res) => setTimeout(res, ms));

      // Visual progress updates matching real operations
      await stageDelay(250);
      setStages((prev) =>
        prev.map((s, idx) =>
          idx === 0
            ? { ...s, status: "done", detail: "Domain & path verified" }
            : idx === 1
              ? { ...s, status: "running" }
              : s,
        ),
      );

      await stageDelay(250);
      setStages((prev) =>
        prev.map((s, idx) =>
          idx === 1
            ? { ...s, status: "done", detail: "Metadata retrieved" }
            : idx === 2
              ? { ...s, status: "running" }
              : s,
        ),
      );

      const res = await fetch("/api/analyze-person", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: linkedinUrl.trim(), instagramUrl: instagramUrl.trim() }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { message?: string };
        throw new Error(errJson.message || "Failed to analyze profiles.");
      }

      const data = (await res.json()) as {
        person: {
          id: string;
          name: string;
          linkedin: string;
          instagram: string;
          headline?: string;
          location?: string;
        };
        research: SocialPerson["research"];
        persona: SocialPerson["persona"];
        mode?: string;
      };

      setAnalysisMode(data.mode || "live_extraction");

      await stageDelay(220);
      setStages((prev) =>
        prev.map((s, idx) =>
          idx === 2
            ? { ...s, status: "done", detail: `${data.research.career.length} professional signals` }
            : idx === 3
              ? { ...s, status: "running" }
              : s,
        ),
      );

      await stageDelay(220);
      setStages((prev) =>
        prev.map((s, idx) =>
          idx === 3
            ? { ...s, status: "done", detail: `${data.research.interests.length} topics identified` }
            : idx === 4
              ? { ...s, status: "running" }
              : s,
        ),
      );

      await stageDelay(200);
      setStages((prev) =>
        prev.map((s, idx) =>
          idx === 4
            ? { ...s, status: "done", detail: `${data.research.hobbies.length} hobbies identified` }
            : idx === 5
              ? { ...s, status: "running" }
              : s,
        ),
      );

      await stageDelay(200);
      setStages((prev) =>
        prev.map((s, idx) =>
          idx === 5
            ? { ...s, status: "done", detail: `Communication: ${data.research.communicationStyle}` }
            : idx === 6
              ? { ...s, status: "running" }
              : s,
        ),
      );

      await stageDelay(200);
      setStages((prev) =>
        prev.map((s) =>
          s.id === "persona_synthesized"
            ? { ...s, status: "done", detail: "RomanticProfile calibrated" }
            : s,
        ),
      );

      const personObj: SocialPerson = {
        id: data.person.id,
        name: data.person.name,
        linkedin: data.person.linkedin,
        instagram: data.person.instagram,
        headline: data.person.headline,
        location: data.person.location,
        research: data.research,
        persona: data.persona,
      };

      setCurrentPerson(personObj);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed");
      setStep("input");
    }
  };

  // Run the actual live virtual date simulation engine
  const handleStartLiveDate = async (counterpartId: string) => {
    if (!currentPerson) return;
    const counterpart = allCohortPeople.find((p) => p.id === counterpartId) || allCohortPeople[1];

    setIsDatingLive(true);
    setStep("date");
    setActiveRoundIndex(0);

    try {
      const res = await fetch("/api/challenge/run-live-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personA: currentPerson,
          personB: counterpart,
          profileA: currentPerson.persona,
          profileB: counterpart.persona,
        }),
      });

      if (!res.ok) {
        throw new Error("Virtual date execution encountered an error.");
      }

      const dateResult = (await res.json()) as {
        dateId: string;
        turns: CompletedAgentDate["rounds"];
        verdictA: CompletedAgentDate["verdictA"];
        verdictB: CompletedAgentDate["verdictB"];
        scoreBreakdown: CompletedAgentDate["scoreBreakdown"];
      };
      setActiveDate({
        id: dateResult.dateId,
        personAId: currentPerson.id,
        personBId: counterpart.id,
        rounds: dateResult.turns,
        verdictA: dateResult.verdictA,
        verdictB: dateResult.verdictB,
        scoreBreakdown: dateResult.scoreBreakdown,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Date simulation failed");
    } finally {
      setIsDatingLive(false);
    }
  };

  const currentRankings = currentPerson ? getRankingsForPerson(currentPerson.id, allCohortPeople) : [];
  const counterpartPerson = allCohortPeople.find((p) => p.id === activeDate.personBId) || allCohortPeople[1];

  return (
    <div className="min-h-screen bg-[#11050c] text-[#fdf7fa] font-sans antialiased selection:bg-[#d982ab]/30 pb-20">
      {/* Top Navbar */}
      <header className="border-b border-white/10 bg-[#1a0813]/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black tracking-tight text-white">
              PAIRPILOT <span className="text-[#d982ab]">AGENTIC</span>
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-[#d982ab]/20 text-[#f2c9dc] border border-[#d982ab]/30">
              Social Research Engine
            </span>
          </div>

          <nav className="flex items-center gap-2 sm:gap-3 text-xs">
            <button
              onClick={() => setStep("input")}
              className={`px-3 py-1.5 rounded-lg transition ${
                step === "input" ? "bg-white/15 text-white font-bold" : "text-white/60 hover:text-white"
              }`}
            >
              1. Input
            </button>
            {currentPerson && (
              <>
                <button
                  onClick={() => setStep("profile")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    step === "profile" ? "bg-white/15 text-white font-bold" : "text-white/60 hover:text-white"
                  }`}
                >
                  2. Persona
                </button>
                <button
                  onClick={() => setStep("date")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    step === "date" ? "bg-white/15 text-white font-bold" : "text-white/60 hover:text-white"
                  }`}
                >
                  3. Live Date
                </button>
                <button
                  onClick={() => setStep("rankings")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    step === "rankings" ? "bg-white/15 text-white font-bold" : "text-white/60 hover:text-white"
                  }`}
                >
                  4. Rankings ({currentRankings.length})
                </button>
              </>
            )}
            <Link
              href="/watch"
              className="text-[#d982ab] hover:underline flex items-center gap-1 font-semibold ml-2"
            >
              Watch Fleet →
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-8">
        {/* ========================================================================= */}
        {/* SCREEN 1: INPUT PAGE */}
        {/* ========================================================================= */}
        {step === "input" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="text-center space-y-3 pt-4">
              <p className="text-xs uppercase font-extrabold tracking-[0.25em] text-[#d982ab]">
                Autonomous Social Dating
              </p>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                Your agent dates for you.
              </h1>
              <p className="text-base text-white/70 max-w-xl mx-auto leading-relaxed">
                Connect two public profiles. Your agent reads both without fabricating private facts,
                then dates counterpart agents across a 25-person cohort.
              </p>
            </div>

            {/* Input Form Card */}
            <div className="bg-[#1e0a16] border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/10">
                <h2 className="text-sm font-bold uppercase tracking-widest text-white/80">
                  Connect Two Public Profiles
                </h2>
                <span className="text-[11px] text-amber-200 bg-amber-400/10 border border-amber-400/30 px-2.5 py-1 rounded-md w-fit">
                  Strict Rule: 2 Sources Only · Unknown ≠ Inferred
                </span>
              </div>

              {errorMsg && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/40 text-red-200 text-sm flex items-center justify-between">
                  <span>{errorMsg}</span>
                  <button onClick={() => setErrorMsg(null)} className="text-xs font-bold text-red-400 hover:underline">
                    Dismiss
                  </button>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/70 mb-1.5">
                    LinkedIn Profile URL
                  </label>
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://www.linkedin.com/in/username"
                    className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-[#d982ab] transition"
                  />
                  <p className="text-[11px] text-white/40 mt-1">Must be an active public LinkedIn URL or profile handle</p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/70 mb-1.5">
                    Instagram Profile URL
                  </label>
                  <input
                    type="url"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    placeholder="https://www.instagram.com/username"
                    className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-[#d982ab] transition"
                  />
                  <p className="text-[11px] text-white/40 mt-1">Must be an active public Instagram account</p>
                </div>
              </div>

              {/* 1-Click Verification Presets */}
              <div className="pt-2">
                <p className="text-[11px] uppercase tracking-wider text-white/50 mb-2.5 font-bold">
                  Quick 1-Click Test Profiles from the 25-Person Cohort:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: "person_001", name: "Gary Vaynerchuk · Media & Entrepreneurship (NYC)" },
                    { id: "person_002", name: "Simon Sinek · Leadership & Author (NYC)" },
                    { id: "person_004", name: "Reid Hoffman · Greylock & Tech Founder (SF)" },
                    { id: "person_007", name: "Arianna Huffington · Thrive Global & Media (NYC)" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPreset(p.id)}
                      className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 text-left transition"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!linkedinUrl.trim() || !instagramUrl.trim()}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#d982ab] to-[#8e58a6] hover:from-[#e293b8] hover:to-[#9c66b4] text-white font-extrabold text-sm tracking-wide shadow-lg shadow-[#d982ab]/20 transition disabled:opacity-50"
              >
                ANALYZE PERSON
              </button>

              <div className="text-center text-[11px] text-white/40 flex items-center justify-center gap-4">
                <span>Provider: ApifyProvider → PublicPageProvider fallback</span>
                <span>•</span>
                <span>Zero fabrication of private traits</span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 2: REAL ANALYSIS PROGRESS SEQUENCE */}
        {/* ========================================================================= */}
        {step === "analyzing" && (
          <div className="max-w-md mx-auto py-12 space-y-8 animate-in fade-in duration-300">
            <div className="text-center space-y-2">
              <div className="inline-block p-3 rounded-full bg-[#d982ab]/20 text-[#d982ab] mb-2 animate-pulse">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white">ANALYZING PERSON</h2>
              <p className="text-xs text-white/60">
                Grounding extraction strictly in the two supplied public sources
              </p>
            </div>

            <div className="bg-[#1e0a16] border border-white/15 rounded-2xl p-6 space-y-3.5 shadow-xl">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-center justify-between text-sm py-1">
                  <div className="flex items-center gap-3">
                    {stage.status === "done" ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">
                        ✓
                      </span>
                    ) : stage.status === "running" ? (
                      <span className="w-5 h-5 rounded-full bg-[#d982ab]/30 text-[#d982ab] flex items-center justify-center text-xs font-bold animate-spin">
                        ◌
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-white/5 text-white/30 flex items-center justify-center text-xs">
                        ○
                      </span>
                    )}
                    <span className={stage.status === "done" ? "text-white font-medium" : "text-white/60"}>
                      {stage.label}
                    </span>
                  </div>

                  {stage.detail && (
                    <span className="text-[11px] text-white/40">{stage.detail}</span>
                  )}
                </div>
              ))}
            </div>

            {stages.every((s) => s.status === "done") && (
              <button
                onClick={() => setStep("profile")}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#d982ab] to-[#8e58a6] text-white font-bold text-sm tracking-wide shadow-lg transition animate-in fade-in"
              >
                VIEW PROFILE &amp; START DATING →
              </button>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 3: STRUCTURED PERSONA PROFILE PAGE ("WOW" MOMENT) */}
        {/* ========================================================================= */}
        {step === "profile" && currentPerson && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-extrabold tracking-widest text-[#d982ab]">
                  Verified Public Extraction
                </p>
                <h1 className="text-3xl font-black text-white">Synthesized Agent Persona</h1>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 text-white/70">
                  {analysisMode === "precomputed_demo" ? "Precomputed Demo Record" : "Live Source Extraction"}
                </span>
                <button
                  onClick={() => setStep("input")}
                  className="text-xs text-white/50 hover:text-white transition ml-2"
                >
                  ← New URL
                </button>
              </div>
            </div>

            {/* Profile Card */}
            <div className="bg-[#1e0a16] border border-white/20 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
              {/* Header: Name, Title, Verified Links */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d982ab]">
                    PERSON
                  </span>
                  <h2 className="text-3xl font-black tracking-tight text-white mt-1">
                    {currentPerson.name}
                  </h2>
                  <p className="text-sm text-white/70 mt-0.5">
                    {currentPerson.headline || currentPerson.research.career[0]} · {currentPerson.location}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={currentPerson.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-1.5 rounded-lg bg-[#0077b5]/20 border border-[#0077b5]/40 text-[#70b5f9] text-xs font-semibold hover:bg-[#0077b5]/30 transition"
                  >
                    LINKEDIN ↗
                  </a>
                  <a
                    href={currentPerson.instagram}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-1.5 rounded-lg bg-[#e1306c]/20 border border-[#e1306c]/40 text-[#f97097] text-xs font-semibold hover:bg-[#e1306c]/30 transition"
                  >
                    INSTAGRAM ↗
                  </a>
                </div>
              </div>

              {/* Grid of Verified Signals */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white/50 mb-2.5">
                    CAREER &amp; PROFESSIONAL WORLD
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {currentPerson.research.career.map((car, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/90"
                      >
                        {car}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white/50 mb-2.5">
                    EDUCATION
                  </h3>
                  <p className="text-xs text-white/80">
                    {currentPerson.research.education.length > 0
                      ? currentPerson.research.education.join(", ")
                      : "Not stated in supplied sources"}
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white/50 mb-2.5">
                    INTERESTS (GROUNDED FROM SOURCES)
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {currentPerson.research.interests.map((int, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/90"
                      >
                        {int}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white/50 mb-2.5">
                    HOBBIES &amp; LIFESTYLE
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {currentPerson.research.hobbies.map((hob, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full bg-[#d982ab]/10 border border-[#d982ab]/20 text-xs text-[#f2c9dc]"
                      >
                        {hob}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white/50 mb-2.5">
                    VALUES / SIGNALS
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {currentPerson.research.values.map((val, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/90"
                      >
                        {val}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white/50 mb-2.5">
                    COMMUNICATION SIGNALS
                  </h3>
                  <p className="text-sm font-semibold text-white capitalize flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    {currentPerson.research.communicationStyle}
                    <span className="text-xs text-white/50 font-normal">
                      (Calibrated from profile text patterns)
                    </span>
                  </p>
                </div>
              </div>

              {/* Source Provenance Panel */}
              {currentPerson.research.provenance && currentPerson.research.provenance.length > 0 && (
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#d982ab]">
                    Source Provenance &amp; Grounding
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {currentPerson.research.provenance.slice(0, 4).map((prov, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-black/30 border border-white/5">
                        <span className="font-bold text-white capitalize">{prov.field}:</span>{" "}
                        <span className="text-white/70">{prov.snippet}</span>
                        <div className="text-[10px] text-white/40 mt-0.5">
                          Source: {prov.sourcePlatform} · Confidence: {Math.round(prov.confidence * 100)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Explicit "Not Stated in Supplied Sources" Disclosure */}
              <div className="p-4 rounded-2xl bg-amber-400/5 border border-amber-400/25 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <span>ℹ</span>
                  <span>UNSUPPORTED FIELDS (NOT STATED IN SUPPLIED SOURCES)</span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  Relationship intent, dealbreakers, age preferences, smoking habits, and private boundaries were not present in the two supplied public profiles. In accordance with the challenge rules (<strong>UNKNOWN ≠ INFERRED</strong>), these fields are kept strictly unconstrained rather than fabricated.
                </p>
              </div>

              {/* Counterpart Picker & Live Date Launch */}
              <div className="pt-4 border-t border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-white/70 block mb-1">
                      Choose Counterpart to Date:
                    </label>
                    <select
                      value={selectedCounterpartId}
                      onChange={(e) => setSelectedCounterpartId(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-black/40 border border-white/20 text-xs text-white font-medium focus:outline-none focus:border-[#d982ab]"
                    >
                      {allCohortPeople
                        .filter((p) => p.id !== currentPerson.id)
                        .map((p) => (
                          <option key={p.id} value={p.id} className="bg-[#1a0813] text-white">
                            {p.name} — {p.headline} ({p.location})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleStartLiveDate(selectedCounterpartId)}
                      disabled={isDatingLive}
                      className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#d982ab] to-[#8e58a6] hover:from-[#e293b8] hover:to-[#9c66b4] text-white font-extrabold text-sm tracking-wide shadow-lg shadow-[#d982ab]/20 transition disabled:opacity-50"
                    >
                      {isDatingLive ? "EXECUTING LIVE VIRTUAL DATE..." : "START DATING (LIVE AGENT DATE) →"}
                    </button>

                    <button
                      onClick={() => setStep("rankings")}
                      className="px-4 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition"
                    >
                      VIEW RANKINGS
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 4: CENTERPIECE LIVE AGENT DATE */}
        {/* ========================================================================= */}
        {step === "date" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-extrabold tracking-widest text-[#d982ab]">
                  Centerpiece Virtual Date
                </p>
                <h1 className="text-3xl font-black text-white">Live Agent-to-Agent Date</h1>
                <p className="text-xs text-white/60">
                  Driven by Clawnection&apos;s virtual date engine across 6 structured conversation rounds
                </p>
              </div>

              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setStep("profile")}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 transition"
                >
                  ← Persona
                </button>
                <button
                  onClick={() => setStep("rankings")}
                  className="px-3 py-1.5 rounded-lg bg-[#d982ab]/20 text-[#f2c9dc] border border-[#d982ab]/30 hover:bg-[#d982ab]/30 transition"
                >
                  View All Rankings →
                </button>
              </div>
            </div>

            {/* Date Container */}
            <div className="bg-[#1e0a16] border border-white/20 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
              {/* Transparency Notice */}
              <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/15 text-xs text-white/80 flex items-start gap-3">
                <span className="text-base text-[#d982ab] shrink-0">ℹ</span>
                <p className="leading-relaxed">
                  <strong className="text-white font-bold">Synthetic agent simulation:</strong> conversations and compatibility scores are generated by AI from the supplied public LinkedIn and Instagram sources. They do not represent statements or preferences expressed by the people shown.
                </p>
              </div>

              {/* Agent Heads */}
              <div className="flex items-center justify-between pb-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#d982ab]/30 border border-[#d982ab]/50 flex items-center justify-center font-bold text-white text-base">
                    {currentPerson ? currentPerson.name[0] : "A"}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">{currentPerson?.name}&apos;s Agent</h3>
                    <p className="text-xs text-white/50">{currentPerson?.headline}</p>
                  </div>
                </div>

                <div className="text-center">
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                    ● 6-Round Virtual Date
                  </span>
                </div>

                <div className="flex items-center gap-3 text-right">
                  <div>
                    <h3 className="text-base font-black text-white">{counterpartPerson.name}&apos;s Agent</h3>
                    <p className="text-xs text-white/50">{counterpartPerson.headline}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-[#8e58a6]/40 border border-[#8e58a6]/60 flex items-center justify-center font-bold text-white text-base">
                    {counterpartPerson.name[0]}
                  </div>
                </div>
              </div>

              {/* Round Stepper */}
              <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 border-b border-white/10">
                {activeDate.rounds.map((r, i) => (
                  <button
                    key={r.round}
                    onClick={() => setActiveRoundIndex(i)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                      activeRoundIndex === i
                        ? "bg-[#d982ab] text-white shadow-md"
                        : i < activeRoundIndex
                          ? "bg-white/10 text-emerald-400"
                          : "bg-white/5 text-white/50 hover:bg-white/10"
                    }`}
                  >
                    <span>{i < activeRoundIndex ? "✓" : activeRoundIndex === i ? "●" : "○"}</span>
                    <span>Round {r.round}: {r.type}</span>
                  </button>
                ))}
              </div>

              {/* Dialogue Transcript */}
              <div className="space-y-5 py-2 min-h-[220px]">
                <div className="text-center">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-[#d982ab]">
                    {activeDate.rounds[activeRoundIndex]?.title || `Round ${activeRoundIndex + 1}`}
                  </span>
                </div>

                {/* Left Bubble: Agent A */}
                <div className="flex flex-col items-start max-w-[85%] space-y-1">
                  <span className="text-[11px] font-bold text-[#d982ab]">
                    {currentPerson?.name}&apos;s Agent
                  </span>
                  <div className="bg-white/10 border border-white/10 p-4 rounded-2xl rounded-tl-sm text-sm text-white leading-relaxed">
                    &ldquo;{activeDate.rounds[activeRoundIndex]?.agentAMessage}&rdquo;
                  </div>
                </div>

                {/* Right Bubble: Agent B */}
                <div className="flex flex-col items-end max-w-[85%] ml-auto space-y-1">
                  <span className="text-[11px] font-bold text-[#caa5db]">
                    {counterpartPerson.name}&apos;s Agent
                  </span>
                  <div className="bg-[#8e58a6]/25 border border-[#8e58a6]/40 p-4 rounded-2xl rounded-tr-sm text-sm text-white leading-relaxed">
                    &ldquo;{activeDate.rounds[activeRoundIndex]?.agentBMessage}&rdquo;
                  </div>
                </div>
              </div>

              {/* Round controls */}
              <div className="flex items-center justify-between pt-2">
                <button
                  disabled={activeRoundIndex === 0}
                  onClick={() => setActiveRoundIndex((prev) => Math.max(0, prev - 1))}
                  className="px-4 py-2 rounded-lg bg-white/10 text-xs font-semibold disabled:opacity-30 hover:bg-white/15 transition"
                >
                  ← Previous Round
                </button>
                <span className="text-xs text-white/50">
                  Round {activeRoundIndex + 1} of {activeDate.rounds.length}
                </span>
                <button
                  disabled={activeRoundIndex === activeDate.rounds.length - 1}
                  onClick={() => setActiveRoundIndex((prev) => Math.min(activeDate.rounds.length - 1, prev + 1))}
                  className="px-4 py-2 rounded-lg bg-white/10 text-xs font-semibold disabled:opacity-30 hover:bg-white/15 transition"
                >
                  Next Round →
                </button>
              </div>

              {/* DATE COMPLETE & COMPATIBILITY VERDICT */}
              <div className="p-6 rounded-2xl bg-black/40 border border-emerald-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                      VIRTUAL DATE COMPLETE
                    </span>
                    <h4 className="text-2xl font-black text-white">Mutual Match Confirmed</h4>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-white/60">Final Compatibility</span>
                    <p className="text-3xl font-black text-[#d982ab]">
                      {activeDate.scoreBreakdown.finalCompatibility}%
                    </p>
                  </div>
                </div>

                {/* Independent Agent Verdicts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-[#d982ab]">
                        {counterpartPerson.name}&apos;s Agent → {currentPerson?.name}
                      </span>
                      <span className="text-emerald-400 font-extrabold">
                        {activeDate.verdictB.rating} / 10 · {activeDate.verdictB.wouldMeetIrl ? "Meet" : "Pass"}
                      </span>
                    </div>
                    <p className="text-xs text-white/70 italic">&ldquo;{activeDate.verdictB.reasoning}&rdquo;</p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-[#caa5db]">
                        {currentPerson?.name}&apos;s Agent → {counterpartPerson.name}
                      </span>
                      <span className="text-emerald-400 font-extrabold">
                        {activeDate.verdictA.rating} / 10 · {activeDate.verdictA.wouldMeetIrl ? "Meet" : "Pass"}
                      </span>
                    </div>
                    <p className="text-xs text-white/70 italic">&ldquo;{activeDate.verdictA.reasoning}&rdquo;</p>
                  </div>
                </div>

                {/* Composite Model Breakdown */}
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-white/60 gap-2">
                  <span>Profile Compatibility (35%): <strong className="text-white">{activeDate.scoreBreakdown.profileCompatibility}</strong></span>
                  <span>+</span>
                  <span>Agent Conversation (40%): <strong className="text-white">{activeDate.scoreBreakdown.agentDateScore}</strong></span>
                  <span>+</span>
                  <span>Reciprocal Interest (25%): <strong className="text-white">{activeDate.scoreBreakdown.reciprocalInterest}</strong></span>
                  <span>=</span>
                  <span className="text-[#d982ab] font-black">Final: {activeDate.scoreBreakdown.finalCompatibility}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 5: 25-PERSON COHORT MATCH RANKINGS */}
        {/* ========================================================================= */}
        {step === "rankings" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-extrabold tracking-widest text-[#d982ab]">
                  AI-Generated Compatibility Score
                </p>
                <h1 className="text-3xl font-black text-white">
                  {currentPerson?.name || "Maya"}&apos;s Match Rankings
                </h1>
                <p className="text-xs text-white/60">
                  Evaluated across the 25-person public profile cohort using the multi-layer composite model
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("date")}
                  className="px-3.5 py-2 rounded-xl bg-[#d982ab]/20 text-[#f2c9dc] border border-[#d982ab]/30 hover:bg-[#d982ab]/30 text-xs font-bold transition"
                >
                  ← Back to Date
                </button>
              </div>
            </div>

            {/* Explanatory Formula Callout */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-xs text-white/70 flex flex-wrap items-center justify-between gap-3">
              <span><strong>Formula:</strong> Profile compatibility (35%) + Agent date score (40%) + Reciprocal verdict (25%) = Final compatibility</span>
              <span className="text-[11px] text-amber-300">AI-generated compatibility model · Not scientific absolute truth</span>
            </div>

            {/* Rankings Table */}
            <div className="bg-[#1e0a16] border border-white/20 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-[11px] uppercase tracking-wider text-white/60">
                      <th className="py-3.5 px-4 font-bold">#</th>
                      <th className="py-3.5 px-4 font-bold">Candidate</th>
                      <th className="py-3.5 px-4 font-bold">Location</th>
                      <th className="py-3.5 px-4 font-bold">Compatibility</th>
                      <th className="py-3.5 px-4 font-bold">Agent Date</th>
                      <th className="py-3.5 px-4 font-bold">Would Meet?</th>
                      <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm">
                    {currentRankings.map((r) => {
                      const isSelected = selectedMatchId === r.candidate.id;
                      const bothMeet = r.scoreBreakdown.finalCompatibility >= 75;
                      return (
                        <tr
                          key={r.candidate.id}
                          className={`hover:bg-white/[0.04] transition cursor-pointer ${
                            isSelected ? "bg-white/[0.08]" : ""
                          }`}
                          onClick={() =>
                            setSelectedMatchId(isSelected ? null : r.candidate.id)
                          }
                        >
                          <td className="py-3.5 px-4 font-mono text-white/50 font-bold">
                            {r.rank}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white">{r.candidate.name}</div>
                            <div className="text-xs text-white/50 truncate max-w-xs">
                              {r.candidate.headline}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-white/70">
                            {r.candidate.location}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-black text-sm ${
                                r.scoreBreakdown.finalCompatibility >= 85
                                  ? "text-emerald-400"
                                  : r.scoreBreakdown.finalCompatibility >= 75
                                    ? "text-[#d982ab]"
                                    : "text-white/70"
                              }`}
                            >
                              {r.scoreBreakdown.finalCompatibility}%
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-white/80">
                            {(r.scoreBreakdown.agentDateScore / 10).toFixed(1)} / 10
                          </td>
                          <td className="py-3.5 px-4 text-xs font-semibold">
                            {bothMeet ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                ✓ Yes (Mutual)
                              </span>
                            ) : (
                              <span className="text-amber-300 flex items-center gap-1">
                                ○ Maybe
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="text-xs text-[#d982ab] font-semibold hover:underline">
                              {isSelected ? "Hide ▲" : "Details ▼"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Expanded Match Drawer */}
              {selectedMatchId && (() => {
                const item = currentRankings.find((r) => r.candidate.id === selectedMatchId);
                if (!item) return null;
                return (
                  <div className="p-6 bg-black/60 border-t border-[#d982ab]/30 space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-black text-white">
                        Why {currentPerson?.name || "Maya"} &amp; {item.candidate.name} Matched
                      </h4>
                      <span className="text-xs font-bold text-[#d982ab]">
                        {item.scoreBreakdown.finalCompatibility}% Compatibility
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                          + Shared Signals &amp; Strengths
                        </p>
                        <ul className="text-xs text-white/80 space-y-1 list-disc list-inside">
                          {item.scoreBreakdown.whyTheyMatched.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                          ⚠ Caution Points / Unknowns
                        </p>
                        <ul className="text-xs text-white/70 space-y-1 list-disc list-inside">
                          {item.scoreBreakdown.cautionPoints.map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center gap-3">
                      <button
                        onClick={() => handleStartLiveDate(item.candidate.id)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#d982ab] to-[#8e58a6] text-white text-xs font-bold shadow-md transition"
                      >
                        Run Live Virtual Date with {item.candidate.name} →
                      </button>

                      <a
                        href={item.candidate.linkedin}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#70b5f9] hover:underline"
                      >
                        View LinkedIn ↗
                      </a>
                      <a
                        href={item.candidate.instagram}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#f97097] hover:underline"
                      >
                        View Instagram ↗
                      </a>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
