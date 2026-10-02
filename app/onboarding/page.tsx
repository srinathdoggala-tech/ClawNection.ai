"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OnboardingSection } from "@/components/OnboardingSection";
import { PhoneShell } from "@/components/PhoneShell";
import { loadProfile, saveProfile, saveSignals, saveGap, syncProfileToServer, syncSignalsToServer, syncGapToServer } from "@/lib/storage";
import { CommunicationStyle, InterestProfile, RelationshipIntent, RomanticProfile } from "@/lib/types/matching";
import { SelfAwarenessGap, WhatsAppSignals } from "@/lib/types/behavioral";
import { WhatsAppUpload } from "@/components/WhatsAppUpload";

type FormState = {
  name: string;
  age: string;
  genderIdentity: string;
  lookingFor: "Men" | "Women" | "Everyone";
  location: string;
  relationshipIntent: RelationshipIntent;
  bio: string;
  interests: string[];
  passions: string[];
  affinityTags: string[];
  customInterests: string;
  values: string;
  communicationStyle: CommunicationStyle;
  sleepSchedule: RomanticProfile["lifestyleHabits"]["sleepSchedule"];
  socialEnergy: RomanticProfile["lifestyleHabits"]["socialEnergy"];
  activityLevel: RomanticProfile["lifestyleHabits"]["activityLevel"];
  drinking: RomanticProfile["lifestyleHabits"]["drinking"];
  smoking: RomanticProfile["lifestyleHabits"]["smoking"];
  dealbreakers: string[];
  customDealbreakers: string;
  idealFirstDate: string;
  preferenceMinAge: string;
  preferenceMaxAge: string;
  partnerPriorities: string[];
  preferredDynamic: "slow-burn" | "balanced" | "instant-spark";
  preferenceNotes: string;
  agentType: RomanticProfile["agentType"];
};

const partnerPriorityOptions = [
  "consistent communication",
  "emotionally available",
  "kind",
  "ambitious",
  "funny",
  "family-oriented",
  "active lifestyle",
  "curious",
] as const;

const interestOptions = [
  "music",
  "food",
  "travel",
  "fitness",
  "arts",
  "outdoors",
  "tech",
  "reading",
  "sports",
  "wellness",
] as const;

const passionOptions = [
  "live music",
  "coffee",
  "museums",
  "cooking",
  "photography",
  "pilates",
  "hiking",
  "design",
  "board games",
  "astrology",
] as const;

const affinityTagOptions = [
  "dog person",
  "planner",
  "spontaneous streak",
  "homebody",
  "night owl energy",
  "zodiac lover",
  "frequent flyer",
  "foodie",
] as const;

const dealbreakerOptions = [
  "smoking",
  "dishonesty",
  "flakiness",
  "heavy partying",
  "poor communication",
  "jealousy",
  "rudeness",
  "non-monogamy mismatch",
] as const;

const defaultForm: FormState = {
  name: "",
  age: "",
  genderIdentity: "",
  lookingFor: "Everyone",
  location: "",
  relationshipIntent: "long-term",
  bio: "",
  interests: [],
  passions: [],
  affinityTags: [],
  customInterests: "",
  values: "",
  communicationStyle: "balanced",
  sleepSchedule: "flexible",
  socialEnergy: "balanced",
  activityLevel: "active",
  drinking: "social",
  smoking: "never",
  dealbreakers: [],
  customDealbreakers: "",
  idealFirstDate: "",
  preferenceMinAge: "24",
  preferenceMaxAge: "38",
  partnerPriorities: [],
  preferredDynamic: "balanced",
  preferenceNotes: "",
  // Default to hosted: the friction-free entry point. Users can switch to
  // bring-your-own from the /connect-agent page if they prefer.
  agentType: "hosted",
};

function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toggleSelection(current: string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function dedupeValues(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function buildDealbreakerList(form: FormState): string[] {
  return dedupeValues([...form.dealbreakers, ...parseCsv(form.customDealbreakers)]);
}

function buildInterestProfile(form: FormState): InterestProfile {
  return {
    core: form.interests,
    passions: dedupeValues([...form.passions, ...parseCsv(form.customInterests)]),
    tags: form.affinityTags,
  };
}

function buildInterestList(form: FormState): string[] {
  const interestProfile = buildInterestProfile(form);
  return dedupeValues([
    ...interestProfile.core,
    ...interestProfile.passions,
    ...interestProfile.tags,
  ]);
}

function buildPreferenceNotes(form: FormState): string {
  const notes: string[] = [];

  if (form.partnerPriorities.length) {
    notes.push(`Partner priorities: ${form.partnerPriorities.join(", ")}.`);
  }

  notes.push(`Preferred dynamic: ${form.preferredDynamic}.`);

  if (form.preferenceNotes.trim()) {
    notes.push(form.preferenceNotes.trim());
  }

  return notes.join(" ");
}

const fieldClass =
  "field mt-2 text-sm";
const labelClass = "grid gap-1 text-sm font-bold text-white/84";
const chipClass =
  "rounded-full border px-3 py-2 text-xs font-bold transition";

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [error, setError] = useState<string | null>(null);
  const [whatsAppApplied, setWhatsAppApplied] = useState(false);

  const profilePreview = useMemo(() => `${form.name || "Your name"}, intent: ${form.relationshipIntent}`, [form]);

  useEffect(() => {
    document.title = "Build your profile · Clawnection";
    // Pre-fill basics (name, age, gender, location, etc.) from any previously
    // saved profile — including data captured during the voice onboarding
    // step-by-step that lives in the same localStorage slot.
    const existing = loadProfile();
    if (!existing) return;
    setForm((prev) => ({
      ...prev,
      name: existing.name ?? prev.name,
      age: existing.age ? String(existing.age) : prev.age,
      genderIdentity: existing.genderIdentity ?? prev.genderIdentity,
      lookingFor:
        (existing.lookingFor as FormState["lookingFor"]) ?? prev.lookingFor,
      location: existing.location ?? prev.location,
      relationshipIntent: existing.relationshipIntent ?? prev.relationshipIntent,
      bio: existing.bio ?? prev.bio,
      values: (existing.values ?? []).join(", ") || prev.values,
      communicationStyle:
        existing.communicationStyle ?? prev.communicationStyle,
      sleepSchedule:
        existing.lifestyleHabits?.sleepSchedule ?? prev.sleepSchedule,
      socialEnergy:
        existing.lifestyleHabits?.socialEnergy ?? prev.socialEnergy,
      activityLevel:
        existing.lifestyleHabits?.activityLevel ?? prev.activityLevel,
      drinking: existing.lifestyleHabits?.drinking ?? prev.drinking,
      smoking: existing.lifestyleHabits?.smoking ?? prev.smoking,
      idealFirstDate: existing.idealFirstDate ?? prev.idealFirstDate,
      preferenceMinAge: existing.preferenceAgeRange?.min
        ? String(existing.preferenceAgeRange.min)
        : prev.preferenceMinAge,
      preferenceMaxAge: existing.preferenceAgeRange?.max
        ? String(existing.preferenceAgeRange.max)
        : prev.preferenceMaxAge,
      preferenceNotes: existing.preferenceNotes ?? prev.preferenceNotes,
    }));
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildCurrentProfile(): RomanticProfile {
    return {
      id: `local-${form.name.toLowerCase().replace(/\s+/g, "-")}`,
      name: form.name || "You",
      age: Number(form.age) || 25,
      genderIdentity: form.genderIdentity,
      lookingFor: form.lookingFor,
      location: form.location,
      relationshipIntent: form.relationshipIntent,
      bio: form.bio,
      interests: buildInterestList(form),
      interestProfile: buildInterestProfile(form),
      values: parseCsv(form.values),
      communicationStyle: form.communicationStyle,
      lifestyleHabits: {
        sleepSchedule: form.sleepSchedule,
        socialEnergy: form.socialEnergy,
        activityLevel: form.activityLevel,
        drinking: form.drinking,
        smoking: form.smoking,
      },
      dealbreakers: buildDealbreakerList(form),
      idealFirstDate: form.idealFirstDate,
      preferenceAgeRange: { min: Number(form.preferenceMinAge) || 18, max: Number(form.preferenceMaxAge) || 60 },
      preferenceNotes: buildPreferenceNotes(form),
      agentType: form.agentType,
    };
  }

  function handleWhatsAppApply(
    updatedProfile: RomanticProfile,
    signals: WhatsAppSignals,
    gap: SelfAwarenessGap,
    fileCount: number,
  ) {
    update("communicationStyle", updatedProfile.communicationStyle);
    update("sleepSchedule", updatedProfile.lifestyleHabits.sleepSchedule);
    saveSignals(signals);
    saveGap(gap);
    // Sync to D1 — profileId may not be final yet, use a temp key derived from current name
    const tempId = `local-${updatedProfile.name.toLowerCase().replace(/\s+/g, "-")}`;
    syncSignalsToServer(tempId, signals, fileCount);
    syncGapToServer(tempId, gap);
    setWhatsAppApplied(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name || !form.age || !form.location || !form.bio) {
      setError("Please complete all required fields before continuing.");
      return;
    }

    const age = Number(form.age);
    const min = Number(form.preferenceMinAge);
    const max = Number(form.preferenceMaxAge);

    if (Number.isNaN(age) || age < 18 || age > 100) {
      setError("Please enter a valid age between 18 and 100.");
      return;
    }

    if (Number.isNaN(min) || Number.isNaN(max) || min < 18 || max < min) {
      setError("Preference age range is invalid. Confirm min/max ages.");
      return;
    }

    const profile: RomanticProfile = {
      id: `local-${form.name.toLowerCase().replace(/\s+/g, "-")}`,
      name: form.name,
      age,
      genderIdentity: form.genderIdentity,
      lookingFor: form.lookingFor,
      location: form.location,
      relationshipIntent: form.relationshipIntent,
      bio: form.bio,
      interests: buildInterestList(form),
      interestProfile: buildInterestProfile(form),
      values: parseCsv(form.values),
      communicationStyle: form.communicationStyle,
      lifestyleHabits: {
        sleepSchedule: form.sleepSchedule,
        socialEnergy: form.socialEnergy,
        activityLevel: form.activityLevel,
        drinking: form.drinking,
        smoking: form.smoking,
      },
      dealbreakers: buildDealbreakerList(form),
      idealFirstDate: form.idealFirstDate,
      preferenceAgeRange: { min, max },
      preferenceNotes: buildPreferenceNotes(form),
      agentType: form.agentType,
    };

    saveProfile(profile);
    syncProfileToServer(profile);
    // Both agent-type choices land on /connect-agent — that page is now the
    // shared launchpad, with both Hosted and Bring-your-own as first-class
    // paths the user can choose between (or change their mind).
    router.push(`/connect-agent?profileId=${encodeURIComponent(profile.id)}`);
  }

  return (
    <PhoneShell>
      <main className="screen-padding space-y-6">
        <header className="space-y-4">
          <Link href="/" className="text-sm font-bold text-white/58">Clawnection</Link>
          <p className="pill w-fit">Text onboarding</p>
          <h1 className="text-4xl font-black leading-none tracking-[-0.045em] text-white">Build your dating profile</h1>
          <p className="text-sm leading-6 text-white/66">
            Your personal agent will represent your priorities during structured virtual dates. You stay in control of every real-world decision.
          </p>
          <p className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-xs text-white/58">Preview: {profilePreview}</p>
        </header>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <OnboardingSection title="Core profile" description="Essentials used for introductions and baseline matching.">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Name *<input className={fieldClass} value={form.name} onChange={(e) => update("name", e.target.value)} required /></label>
              <label className={labelClass}>Age *<input className={fieldClass} inputMode="numeric" value={form.age} onChange={(e) => update("age", e.target.value)} required /></label>
              <label className={`${labelClass} sm:col-span-2`}>Gender *
                <select
                  className={fieldClass}
                  value={form.genderIdentity}
                  onChange={(e) => {
                    const g = e.target.value;
                    update("genderIdentity", g);
                    // This iteration: heterosexual matching only — auto-set lookingFor.
                    if (g === "Male") update("lookingFor", "Women");
                    else if (g === "Female") update("lookingFor", "Men");
                  }}
                  required
                >
                  <option value="">Select…</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <span className="mt-1 block text-xs text-white/55">
                  This iteration of Clawnection focuses on men and women seeking each other. Broader options are coming.
                </span>
              </label>
              <label className={`${labelClass} sm:col-span-2`}>Location *<input className={fieldClass} value={form.location} onChange={(e) => update("location", e.target.value)} required /></label>
            </div>
          </OnboardingSection>

          <OnboardingSection title="Connection preferences" description="What you want and how you relate.">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Relationship intent
                <select className={fieldClass} value={form.relationshipIntent} onChange={(e) => update("relationshipIntent", e.target.value as RelationshipIntent)}>
                  <option value="long-term">Long-term</option>
                  <option value="serious-dating">Serious dating</option>
                  <option value="exploring">Exploring</option>
                  <option value="casual">Casual / hookups</option>
                  <option value="friendship-first">Friendship first</option>
                </select>
              </label>
              <label className={labelClass}>Communication style
                <select className={fieldClass} value={form.communicationStyle} onChange={(e) => update("communicationStyle", e.target.value as CommunicationStyle)}>
                  <option value="balanced">Balanced</option>
                  <option value="direct">Direct</option>
                  <option value="warm">Warm</option>
                  <option value="playful">Playful</option>
                  <option value="reflective">Reflective</option>
                </select>
              </label>
              <label className={`${labelClass} sm:col-span-2`}>Short bio *
                <textarea className={fieldClass} rows={3} value={form.bio} onChange={(e) => update("bio", e.target.value)} required />
              </label>
              <fieldset className="sm:col-span-2 rounded-[24px] border border-white/12 p-4">
                <legend className="px-2 text-sm font-bold text-white">Interests and passions</legend>
                <p className="px-2 text-xs leading-5 text-white/58">
                  Choose broad interests, then add the specific passions and vibe tags that make your profile feel like you.
                </p>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/46">Core interests</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {interestOptions.map((option) => {
                        const selected = form.interests.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            className={`${chipClass} ${selected ? "border-fuchsia-300/70 bg-fuchsia-400/18 text-white" : "border-white/12 bg-white/[0.04] text-white/72"}`}
                            onClick={() => update("interests", toggleSelection(form.interests, option))}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/46">Passions</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {passionOptions.map((option) => {
                        const selected = form.passions.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            className={`${chipClass} ${selected ? "border-amber-300/70 bg-amber-400/18 text-white" : "border-white/12 bg-white/[0.04] text-white/72"}`}
                            onClick={() => update("passions", toggleSelection(form.passions, option))}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/46">Affinity tags</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {affinityTagOptions.map((option) => {
                        const selected = form.affinityTags.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            className={`${chipClass} ${selected ? "border-sky-300/70 bg-sky-400/18 text-white" : "border-white/12 bg-white/[0.04] text-white/72"}`}
                            onClick={() => update("affinityTags", toggleSelection(form.affinityTags, option))}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <label className={`${labelClass} mt-4`}>
                  Add a few custom interests or passions
                  <input
                    className={fieldClass}
                    value={form.customInterests}
                    onChange={(e) => update("customInterests", e.target.value)}
                    placeholder="e.g. ceramics, sci-fi novels, karaoke"
                  />
                </label>
              </fieldset>
              <label className={labelClass}>Values (comma-separated)
                <input className={fieldClass} value={form.values} onChange={(e) => update("values", e.target.value)} />
              </label>
            </div>
          </OnboardingSection>

          <OnboardingSection title="Lifestyle & boundaries" description="Signals that influence practical compatibility.">
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["sleepSchedule", "Sleep schedule", ["early-bird", "flexible", "night-owl"]],
                ["socialEnergy", "Social energy", ["low-key", "balanced", "high-energy"]],
                ["activityLevel", "Activity level", ["relaxed", "active", "very-active"]],
                ["drinking", "Drinking", ["never", "social", "regular"]],
                ["smoking", "Smoking", ["never", "occasionally", "regular"]],
              ] as const).map(([key, label, options]) => (
                <label key={key} className={labelClass}>
                  {label}
                  <select
                    className={fieldClass}
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value as FormState[typeof key])}
                  >
                    {options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ))}
              <fieldset className="sm:col-span-2 rounded-[24px] border border-white/12 p-4">
                <legend className="px-2 text-sm font-bold text-white">Dealbreakers</legend>
                <p className="px-2 text-xs leading-5 text-white/58">
                  Pick the things your agent should treat as likely blockers. These feed directly into match quality checks.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dealbreakerOptions.map((option) => {
                    const selected = form.dealbreakers.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`${chipClass} ${selected ? "border-emerald-300/70 bg-emerald-400/18 text-white" : "border-white/12 bg-white/[0.04] text-white/72"}`}
                        onClick={() => update("dealbreakers", toggleSelection(form.dealbreakers, option))}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                <label className={`${labelClass} mt-4`}>
                  Add anything custom
                  <input
                    className={fieldClass}
                    value={form.customDealbreakers}
                    onChange={(e) => update("customDealbreakers", e.target.value)}
                    placeholder="e.g. cruelty, inconsistent effort"
                  />
                </label>
              </fieldset>
              <label className={`${labelClass} sm:col-span-2`}>Ideal first date
                <input className={fieldClass} value={form.idealFirstDate} onChange={(e) => update("idealFirstDate", e.target.value)} />
              </label>
            </div>
          </OnboardingSection>

          <OnboardingSection
            title={
              whatsAppApplied
                ? "Enrich with your WhatsApp data - behavioral data applied"
                : "Enrich with your WhatsApp data"
            }
            description="Optional. Upload one WhatsApp chat export — your data stays in your browser only."
          >
            <WhatsAppUpload
              currentProfile={buildCurrentProfile()}
              onApply={handleWhatsAppApply}
              onSkip={() => {}}
            />
          </OnboardingSection>

          <OnboardingSection title="Match preferences + agent mode" description="Set your counterpart preferences and choose your personal agent path.">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Preferred min age
                <input className={fieldClass} inputMode="numeric" value={form.preferenceMinAge} onChange={(e) => update("preferenceMinAge", e.target.value)} />
              </label>
              <label className={labelClass}>Preferred max age
                <input className={fieldClass} inputMode="numeric" value={form.preferenceMaxAge} onChange={(e) => update("preferenceMaxAge", e.target.value)} />
              </label>
              <fieldset className="sm:col-span-2 rounded-[24px] border border-white/12 p-4">
                <legend className="px-2 text-sm font-bold text-white">Partner priorities</legend>
                <p className="px-2 text-xs leading-5 text-white/58">
                  Choose the qualities that matter most so your agent can explain what a strong fit looks like.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {partnerPriorityOptions.map((option) => {
                    const selected = form.partnerPriorities.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`${chipClass} ${selected ? "border-cyan-300/70 bg-cyan-400/18 text-white" : "border-white/12 bg-white/[0.04] text-white/72"}`}
                        onClick={() => update("partnerPriorities", toggleSelection(form.partnerPriorities, option))}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="sm:col-span-2 rounded-[24px] border border-white/12 p-4">
                <legend className="px-2 text-sm font-bold text-white">Preferred dynamic</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {([
                    ["slow-burn", "Slow burn"],
                    ["balanced", "Balanced"],
                    ["instant-spark", "Instant spark"],
                  ] as const).map(([value, label]) => {
                    const selected = form.preferredDynamic === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${selected ? "border-pink-300/70 bg-pink-400/18 text-white" : "border-white/12 bg-white/[0.04] text-white/72"}`}
                        onClick={() => update("preferredDynamic", value)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className={`${labelClass} sm:col-span-2`}>Anything else your agent should know?
                <textarea
                  className={fieldClass}
                  rows={2}
                  value={form.preferenceNotes}
                  onChange={(e) => update("preferenceNotes", e.target.value)}
                  placeholder="Examples: values a calm pace, wants someone close to family, prefers planning ahead"
                />
              </label>
              <fieldset className="sm:col-span-2 rounded-[24px] border border-white/12 p-3">
                <legend className="px-2 text-sm font-bold text-white">Agent type</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/12 bg-white/[0.04] p-3 text-sm text-white/76">
                    <input type="radio" className="mt-1 shrink-0" name="agentType" checked={form.agentType === "hosted"} onChange={() => update("agentType", "hosted")} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-white">Hosted by Clawnection</span>
                      <span className="mt-1 block text-xs leading-relaxed text-white/55">
                        We run your agent on our infrastructure — one click, no setup.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/12 bg-white/[0.04] p-3 text-sm text-white/76">
                    <input type="radio" className="mt-1 shrink-0" name="agentType" checked={form.agentType === "external-mock"} onChange={() => update("agentType", "external-mock")} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-white">Bring your own agent</span>
                      <span className="mt-1 block text-xs leading-relaxed text-white/55">
                        OpenClaw, ZeroClaw, Claude Desktop, or any HTTP-capable AI assistant.
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>
            </div>
          </OnboardingSection>

          {error ? <p role="alert" className="alert-surface px-4 py-3 text-sm">{error}</p> : null}

          <button
            type="submit"
            className="primary-button w-full"
          >
            {form.agentType === "external-mock"
              ? "Save profile and connect my agent"
              : form.agentType === "hosted"
              ? "Save profile and activate hosted agent"
              : "Save profile and run a virtual date"}
          </button>
        </form>
      </main>
    </PhoneShell>
  );
}
