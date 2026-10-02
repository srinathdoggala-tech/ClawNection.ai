"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CompletedAgentDate,
  demoAgentDates,
  getDemoPeople,
  getRankingsForPerson,
} from "@/lib/data/demoPeople";

export default function FinishedDemoPage() {
  const allCohortPeople = getDemoPeople();
  const [selectedPersonId, setSelectedPersonId] = useState<string>("person_001"); // Gary Vaynerchuk
  const [activeDate, setActiveDate] = useState<CompletedAgentDate>(demoAgentDates[0]);
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);
  const [isSimulatingLive, setIsSimulatingLive] = useState(false);
  const [simulatedError, setSimulatedError] = useState<string | null>(null);

  const currentPerson =
    allCohortPeople.find((p) => p.id === selectedPersonId) || allCohortPeople[0];
  const rankings = getRankingsForPerson(currentPerson.id, allCohortPeople);

  // Sync active date when selected person changes
  useEffect(() => {
    // Check if an existing precomputed date involves currentPerson
    const matchingDate = demoAgentDates.find(
      (d) => d.personAId === currentPerson.id || d.personBId === currentPerson.id,
    );
    if (matchingDate) {
      setActiveDate(matchingDate);
    } else {
      // Pick top ranked candidate and prepare date
      const topMatch = rankings[0]?.candidate || allCohortPeople[1];
      void loadOrSimulateDate(currentPerson.id, topMatch.id);
    }
    setActiveRoundIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPerson.id]);

  const counterpartPerson =
    allCohortPeople.find(
      (p) =>
        p.id ===
        (activeDate.personAId === currentPerson.id
          ? activeDate.personBId
          : activeDate.personAId),
    ) || allCohortPeople[1];

  const loadOrSimulateDate = async (personAId: string, personBId: string) => {
    setSimulatedError(null);
    const existing = demoAgentDates.find(
      (d) =>
        (d.personAId === personAId && d.personBId === personBId) ||
        (d.personAId === personBId && d.personBId === personAId),
    );
    if (existing) {
      setActiveDate(existing);
      setActiveRoundIndex(0);
      return;
    }

    // Call live date endpoint
    try {
      setIsSimulatingLive(true);
      const res = await fetch("/api/challenge/run-live-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personAId, personBId }),
      });
      const data = (await res.json()) as {
        dateId: string;
        turns: CompletedAgentDate["rounds"];
        verdictA: CompletedAgentDate["verdictA"];
        verdictB: CompletedAgentDate["verdictB"];
        scoreBreakdown: CompletedAgentDate["scoreBreakdown"];
      };
      setActiveDate({
        id: data.dateId,
        personAId,
        personBId,
        rounds: data.turns,
        verdictA: data.verdictA,
        verdictB: data.verdictB,
        scoreBreakdown: data.scoreBreakdown,
      });
      setActiveRoundIndex(0);
    } catch (err) {
      setSimulatedError(err instanceof Error ? err.message : "Date simulation failed.");
    } finally {
      setIsSimulatingLive(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#11050c] text-[#fdf7fa] font-sans antialiased selection:bg-[#d982ab]/30 pb-24">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-[#1a0813]/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black tracking-tight text-white">
              PAIRPILOT <span className="text-[#d982ab]">AGENTIC</span>
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Completed 25-Person Showcase
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link
              href="/create-person"
              className="px-3 py-1.5 rounded-lg bg-[#d982ab]/20 text-[#f2c9dc] border border-[#d982ab]/30 hover:bg-[#d982ab]/30 transition"
            >
              Live Custom URL Flow →
            </Link>
            <Link href="/watch" className="text-white/60 hover:text-white transition">
              Watch Fleet
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-8 space-y-10">
        {/* Hero Section */}
        <div className="text-center space-y-3 pt-2">
          <p className="text-xs uppercase font-extrabold tracking-[0.25em] text-[#d982ab]">
            Challenge Showcase · Finished Example
          </p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
            25 People · 25 Autonomous Dating Agents
          </h1>
          <p className="text-sm sm:text-base text-white/70 max-w-2xl mx-auto leading-relaxed">
            AI agents read two public social sources (LinkedIn + Instagram), construct source-grounded personas without fabricating private traits, simulate multi-round virtual dates, and submit independent compatibility verdicts.
          </p>
        </div>

        {/* Global Transparency Notice */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/15 text-xs text-white/80 flex items-start gap-3 shadow-lg">
          <span className="text-lg text-[#d982ab] shrink-0 leading-none">ℹ</span>
          <div className="space-y-1">
            <p className="font-bold text-white">
              Synthetic Agent Simulation &amp; Source Grounding Notice
            </p>
            <p className="leading-relaxed text-white/70">
              All conversations, agent verdicts, and compatibility scores shown are generated by AI agents strictly from the supplied public LinkedIn and Instagram profiles. They do not represent statements, beliefs, or preferences expressed by the people shown. Private attributes (relationship intent, dealbreakers, orientation) are marked as <strong>unknown</strong> rather than fabricated.
            </p>
          </div>
        </div>

        {/* SECTION 1: 25-Person Verified Cohort Selector */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-[#d982ab]">
              1. The 25-Person Cohort (Select Any Person)
            </h2>
            <span className="text-[11px] text-white/50 font-medium">
              25 / 25 Verified Public Profiles
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 max-h-[290px] overflow-y-auto p-1.5 rounded-2xl bg-black/30 border border-white/10">
            {allCohortPeople.map((person, idx) => {
              const isSelected = person.id === currentPerson.id;
              return (
                <button
                  key={person.id}
                  onClick={() => setSelectedPersonId(person.id)}
                  className={`p-3 rounded-xl text-left transition flex flex-col justify-between border ${
                    isSelected
                      ? "bg-[#d982ab]/20 border-[#d982ab] text-white shadow-md shadow-[#d982ab]/10"
                      : "bg-[#1e0a16]/60 border-white/5 text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-black truncate">{person.name}</span>
                  </div>
                  <p className="text-[10px] text-white/50 line-clamp-1 mb-2">
                    {person.location}
                  </p>
                  <div className="flex items-center gap-1.5 text-[9px] text-white/40 pt-1 border-t border-white/5">
                    <span className="text-[#0077b5] font-bold">in</span>
                    <span>•</span>
                    <span className="text-[#e4405f] font-bold">ig</span>
                    <span className="ml-auto text-emerald-400 font-bold">✓</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* SECTION 2 & 3: Selected Person Analysis + Centerpiece Virtual Date */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column (5 Cols): Selected Persona Card */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#1e0a16] border border-white/15 rounded-3xl p-6 shadow-2xl space-y-6">
              {/* Person Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#d982ab]">
                    Active Focus Person
                  </span>
                  <h2 className="text-2xl font-black text-white">{currentPerson.name}</h2>
                  <p className="text-xs text-white/60 mt-0.5">{currentPerson.headline}</p>
                  <p className="text-[11px] text-white/40 mt-1">📍 {currentPerson.location}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#d982ab] to-[#8e58a6] flex items-center justify-center text-white text-lg font-black shadow-md shrink-0">
                  {currentPerson.name[0]}
                </div>
              </div>

              {/* Verified Sources */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">
                  Supplied Public Sources (2 Only)
                </span>
                <div className="space-y-1.5 text-xs">
                  <a
                    href={currentPerson.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10 hover:border-[#0077b5] transition text-white/80"
                  >
                    <span className="flex items-center gap-2 font-medium truncate">
                      <span className="text-[#0077b5] font-black">LinkedIn:</span>
                      <span className="truncate text-white/60">{currentPerson.linkedin}</span>
                    </span>
                    <span className="text-emerald-400 text-[10px] font-bold shrink-0 ml-2">
                      VERIFIED ↗
                    </span>
                  </a>

                  <a
                    href={currentPerson.instagram}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10 hover:border-[#e4405f] transition text-white/80"
                  >
                    <span className="flex items-center gap-2 font-medium truncate">
                      <span className="text-[#e4405f] font-black">Instagram:</span>
                      <span className="truncate text-white/60">{currentPerson.instagram}</span>
                    </span>
                    <span className="text-emerald-400 text-[10px] font-bold shrink-0 ml-2">
                      PUBLIC ↗
                    </span>
                  </a>
                </div>
              </div>

              {/* Extracted Signals */}
              <div className="space-y-4 pt-1">
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1.5">
                    CAREER SIGNALS (FROM LINKEDIN)
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {currentPerson.research.career.map((c, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/90"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1.5">
                    INTERESTS &amp; TOPICS
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {currentPerson.research.interests.map((it, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/90"
                      >
                        {it}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1.5">
                    HOBBIES &amp; LIFESTYLE (FROM INSTAGRAM)
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {currentPerson.research.hobbies.map((h, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/90"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1.5">
                    VALUES &amp; SIGNALS
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {currentPerson.research.values.map((v, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/90"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-1.5">
                    COMMUNICATION STYLE
                  </h3>
                  <p className="text-xs font-semibold text-white capitalize flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    {currentPerson.research.communicationStyle}
                    <span className="text-[11px] text-white/50 font-normal">
                      (calibrated from public post text patterns)
                    </span>
                  </p>
                </div>
              </div>

              {/* Unsupported Fields Disclosure */}
              <div className="p-3.5 rounded-2xl bg-amber-400/5 border border-amber-400/25 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <span>ℹ</span>
                  <span>UNSUPPORTED FIELDS (UNKNOWN ≠ INFERRED)</span>
                </div>
                <p className="text-[11px] text-white/70 leading-relaxed">
                  Relationship intent, dealbreakers, age preferences, and private boundaries were not stated in the two public profiles. These fields remain strictly unconstrained.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column (7 Cols): Virtual Date + Verdicts + Rankings */}
          <div className="lg:col-span-7 space-y-8">
            {/* Centerpiece Date Container */}
            <div className="bg-[#1e0a16] border border-white/20 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6">
              {/* Date Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#d982ab]/30 border border-[#d982ab]/50 flex items-center justify-center font-bold text-white text-sm">
                    {currentPerson.name[0]}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">{currentPerson.name}&apos;s Agent</h3>
                    <p className="text-[10px] text-white/50">Primary Candidate</p>
                  </div>
                </div>

                <div className="text-center">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                    ● 6-Round Date
                  </span>
                </div>

                <div className="flex items-center gap-3 text-right">
                  <div>
                    <h3 className="text-sm font-black text-white">{counterpartPerson.name}&apos;s Agent</h3>
                    <p className="text-[10px] text-white/50">Counterpart Candidate</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[#8e58a6]/40 border border-[#8e58a6]/60 flex items-center justify-center font-bold text-white text-sm">
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
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1 ${
                      activeRoundIndex === i
                        ? "bg-[#d982ab] text-white shadow-md"
                        : i < activeRoundIndex
                          ? "bg-white/10 text-emerald-400"
                          : "bg-white/5 text-white/50 hover:bg-white/10"
                    }`}
                  >
                    <span>{i < activeRoundIndex ? "✓" : activeRoundIndex === i ? "●" : "○"}</span>
                    <span>R{r.round}: {r.type}</span>
                  </button>
                ))}
              </div>

              {/* Dialogue Transcript */}
              <div className="space-y-4 py-2 min-h-[200px]">
                <div className="text-center">
                  <span className="text-[11px] uppercase font-extrabold tracking-widest text-[#d982ab]">
                    {activeDate.rounds[activeRoundIndex]?.title || `Round ${activeRoundIndex + 1}`}
                  </span>
                </div>

                {/* Left Bubble: Agent A */}
                <div className="flex flex-col items-start max-w-[88%] space-y-1">
                  <span className="text-[10px] font-bold text-[#f2c9dc]">
                    {currentPerson.name}&apos;s Agent
                  </span>
                  <div className="p-3.5 rounded-2xl rounded-tl-sm bg-white/10 border border-white/15 text-xs text-white leading-relaxed">
                    {activeDate.rounds[activeRoundIndex]?.agentAMessage}
                  </div>
                </div>

                {/* Right Bubble: Agent B */}
                <div className="flex flex-col items-end max-w-[88%] ml-auto space-y-1">
                  <span className="text-[10px] font-bold text-[#c9a0dc]">
                    {counterpartPerson.name}&apos;s Agent
                  </span>
                  <div className="p-3.5 rounded-2xl rounded-tr-sm bg-[#8e58a6]/25 border border-[#8e58a6]/40 text-xs text-white leading-relaxed text-right">
                    {activeDate.rounds[activeRoundIndex]?.agentBMessage}
                  </div>
                </div>
              </div>

              {/* Round Navigation */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                <button
                  disabled={activeRoundIndex === 0}
                  onClick={() => setActiveRoundIndex((prev) => Math.max(0, prev - 1))}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-30"
                >
                  ← Previous Round
                </button>
                <span className="text-white/40 text-[11px]">
                  Round {activeRoundIndex + 1} of 6
                </span>
                <button
                  disabled={activeRoundIndex === activeDate.rounds.length - 1}
                  onClick={() =>
                    setActiveRoundIndex((prev) =>
                      Math.min(activeDate.rounds.length - 1, prev + 1),
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white disabled:opacity-30"
                >
                  Next Round →
                </button>
              </div>

              {/* DUAL VERDICTS & COMPOSITE SCORING */}
              <div className="pt-4 border-t border-white/15 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-[#d982ab]">
                  Independent Agent Verdicts &amp; Multi-Factor Score
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Verdict A */}
                  <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">
                        {currentPerson.name}&apos;s Agent
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-extrabold border border-emerald-500/40">
                        {activeDate.verdictA.wouldMeetIrl ? "WOULD MEET IRL: YES" : "DECLINE"}
                      </span>
                    </div>
                    <div className="text-xl font-black text-[#d982ab]">
                      {activeDate.verdictA.rating} <span className="text-xs text-white/40">/ 10</span>
                    </div>
                    <p className="text-[11px] text-white/70 leading-relaxed">
                      {activeDate.verdictA.reasoning}
                    </p>
                  </div>

                  {/* Verdict B */}
                  <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">
                        {counterpartPerson.name}&apos;s Agent
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-extrabold border border-emerald-500/40">
                        {activeDate.verdictB.wouldMeetIrl ? "WOULD MEET IRL: YES" : "DECLINE"}
                      </span>
                    </div>
                    <div className="text-xl font-black text-[#8e58a6]">
                      {activeDate.verdictB.rating} <span className="text-xs text-white/40">/ 10</span>
                    </div>
                    <p className="text-[11px] text-white/70 leading-relaxed">
                      {activeDate.verdictB.reasoning}
                    </p>
                  </div>
                </div>

                {/* Score Breakdown Bar */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-white/[0.04] to-white/[0.01] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                        Weighted Composite Compatibility
                      </span>
                      <div className="text-2xl font-black text-white">
                        {activeDate.scoreBreakdown.finalCompatibility}%
                      </div>
                    </div>
                    <span className="text-xs text-white/60">
                      Profile (35%) + Date (40%) + Reciprocal (25%)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-[10px] text-white/40 block">Profile Match</span>
                      <span className="font-bold text-white">
                        {activeDate.scoreBreakdown.profileCompatibility}%
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-[10px] text-white/40 block">Agent Date Chemistry</span>
                      <span className="font-bold text-white">
                        {activeDate.scoreBreakdown.agentDateScore}%
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-[10px] text-white/40 block">Reciprocal Interest</span>
                      <span className="font-bold text-white">
                        {activeDate.scoreBreakdown.reciprocalInterest}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4: Cohort Rankings (Click Any Row to Inspect Match) */}
            <div className="bg-[#1e0a16] border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-[#d982ab]">
                    {currentPerson.name}&apos;s Match Rankings (All 24 Counterparts)
                  </h3>
                  <p className="text-[11px] text-white/50">
                    Click any candidate row below to inspect date dialogue &amp; verdicts
                  </p>
                </div>
                <span className="text-xs font-bold text-white/60">
                  {rankings.length} Matches Ranked
                </span>
              </div>

              {simulatedError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {simulatedError}
                </div>
              )}

              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {rankings.map((rankItem) => {
                  const isCurrentCounterpart = rankItem.candidate.id === counterpartPerson.id;
                  return (
                    <button
                      key={rankItem.candidate.id}
                      onClick={() =>
                        loadOrSimulateDate(currentPerson.id, rankItem.candidate.id)
                      }
                      disabled={isSimulatingLive}
                      className={`w-full p-3 rounded-2xl border text-left transition flex items-center justify-between gap-3 ${
                        isCurrentCounterpart
                          ? "bg-[#d982ab]/20 border-[#d982ab] shadow-md"
                          : "bg-black/30 border-white/5 hover:bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                            rankItem.rank === 1
                              ? "bg-amber-400 text-black font-extrabold"
                              : rankItem.rank === 2
                                ? "bg-slate-300 text-black font-bold"
                                : rankItem.rank === 3
                                  ? "bg-amber-700 text-white font-bold"
                                  : "bg-white/10 text-white/60"
                          }`}
                        >
                          #{rankItem.rank}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-white truncate">
                              {rankItem.candidate.name}
                            </span>
                            <span className="text-[10px] text-white/40 truncate">
                              {rankItem.candidate.location}
                            </span>
                          </div>
                          <p className="text-[11px] text-white/60 truncate">
                            {rankItem.candidate.headline}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-black text-white">
                            {rankItem.scoreBreakdown.finalCompatibility}%
                          </span>
                          <span className="text-[10px] text-white/40 block">Compatibility</span>
                        </div>
                        <span className="text-white/40 text-xs">
                          {isCurrentCounterpart ? "● ACTIVE" : "→"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
