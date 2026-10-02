"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Vapi from "@vapi-ai/web";
import { PhoneShell } from "@/components/PhoneShell";
import { PhotoPicker } from "@/components/PhotoPicker";
import { VoiceOrb } from "@/components/VoiceOrb";
import { saveProfile, syncProfileToServer } from "@/lib/storage";
import { VOICE_ONBOARDING_ENABLED } from "@/lib/featureFlags";
import {
  CommunicationStyle,
  Occupation,
  RelationshipIntent,
  RomanticProfile,
} from "@/lib/types/matching";

type ProfileData = {
  name?: string;
  lastName?: string;
  age?: number;
  phoneNumber?: string;
  genderIdentity?: string;
  lookingFor?: string;
  location?: string;
  occupation?: Occupation;
  instagram?: string;
  linkedin?: string;
  relationshipIntent?: RelationshipIntent;
  bio?: string;
  interests?: string[];
  values?: string[];
  communicationStyle?: CommunicationStyle;
  sleepSchedule?: RomanticProfile["lifestyleHabits"]["sleepSchedule"];
  socialEnergy?: RomanticProfile["lifestyleHabits"]["socialEnergy"];
  activityLevel?: RomanticProfile["lifestyleHabits"]["activityLevel"];
  drinking?: RomanticProfile["lifestyleHabits"]["drinking"];
  smoking?: RomanticProfile["lifestyleHabits"]["smoking"];
  dealbreakers?: string[];
  idealFirstDate?: string;
  preferenceMinAge?: number;
  preferenceMaxAge?: number;
  preferenceNotes?: string;
  agentType?: RomanticProfile["agentType"];
};

type StepId =
  | "welcome"
  | "name"
  | "dob"
  | "phone"
  | "location"
  | "occupationType"
  | "occupationPlace"
  | "gender"
  | "preference"
  | "intent"
  | "photo"
  | "socials"
  | "voice";

const STEP_ORDER: StepId[] = [
  "welcome",
  "name",
  "dob",
  "phone",
  "location",
  "occupationType",
  "occupationPlace",
  "gender",
  // "preference" is auto-derived from gender for this iteration (heterosexual
  // matching only). Step skipped in the UI; state still maintained.
  "intent",
  "photo",
  "socials",
  "voice",
];

/*
 * Group the steps into three user-centric phases. The progress bar shows
 * exactly three segments so users feel like they're checking off accomplishments
 * rather than counting "step 7 of 12".
 */
type PhaseId = "basics" | "vibe" | "voice";

type Phase = {
  id: PhaseId;
  label: string;
  inProgressLabel: string;
  doneLabel: string;
  steps: StepId[];
};

const PHASES: Phase[] = [
  {
    id: "basics",
    label: "The basics",
    inProgressLabel: "Let's get to know you",
    doneLabel: "Basics ✓",
    steps: ["welcome", "name", "dob", "phone", "location", "occupationType", "occupationPlace"],
  },
  {
    id: "vibe",
    label: "Your vibe",
    inProgressLabel: "Tell us your vibe",
    doneLabel: "Vibe ✓",
    steps: ["gender", "intent", "photo", "socials"],
  },
  {
    id: "voice",
    label: "Meet your AI",
    inProgressLabel: "Meet your AI",
    doneLabel: "All done ✓",
    steps: ["voice"],
  },
];

function getPhaseFor(step: StepId): Phase {
  return PHASES.find((p) => p.steps.includes(step)) ?? PHASES[0];
}

/*
 * Returns each phase's state for the progress bar. A phase is `done` when the
 * user has moved past its last step, `active` when their current step is
 * inside it (with a 0..1 fill ratio for the active segment), and `upcoming`
 * otherwise.
 */
function getPhaseProgress(currentStep: StepId): Array<{
  phase: Phase;
  state: "done" | "active" | "upcoming";
  fillRatio: number;
}> {
  const currentPhaseId = getPhaseFor(currentStep).id;
  let seenActive = false;
  return PHASES.map((phase) => {
    if (phase.id === currentPhaseId) {
      seenActive = true;
      const idxInPhase = phase.steps.indexOf(currentStep);
      // Make even the very first step show some fill so the user feels they've
      // already taken a step forward by landing on this phase.
      const denom = Math.max(phase.steps.length - 1, 1);
      const ratio = phase.steps.length === 1 ? 1 : Math.max(0.18, idxInPhase / denom);
      return { phase, state: "active" as const, fillRatio: ratio };
    }
    return seenActive
      ? { phase, state: "upcoming" as const, fillRatio: 0 }
      : { phase, state: "done" as const, fillRatio: 1 };
  });
}

/*
 * Capitalize each name token. Splits on spaces, hyphens, and apostrophes so
 * "mary jane" → "Mary Jane", "o'brien" → "O'Brien", "jean-luc" → "Jean-Luc".
 * Preserves all delimiters and lowercases everything after the first letter
 * of each token. Safe to call from onChange (idempotent).
 */
function capitalizeName(input: string): string {
  return input.replace(/([^\s'-]+)/g, (token) =>
    token.charAt(0).toUpperCase() + token.slice(1).toLowerCase(),
  );
}

/*
 * Computes age from an ISO 'YYYY-MM-DD' date string (the value emitted by
 * <input type="date">). Returns 0 for invalid input. Accounts for whether
 * this year's birthday has already happened.
 */
function computeAgeFromIsoDate(iso: string): number {
  if (!iso) return 0;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return 0;
  const today = new Date();
  let age = today.getFullYear() - year;
  const beforeBirthdayThisYear =
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

/*
 * Parses a permissive date string like "03/15/2002", "3-15-2002", or
 * "2002-03-15" into an ISO YYYY-MM-DD string. Returns empty string for
 * unrecognized or out-of-range input. Two-digit years are rejected because
 * 02 vs 1902 vs 2002 is ambiguous.
 */
function parseDobInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  // Match either MM/DD/YYYY (or MM-DD-YYYY) or YYYY-MM-DD (or YYYY/MM/DD).
  const usMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(trimmed);
  const isoMatch = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/.exec(trimmed);
  let year: number, month: number, day: number;
  if (usMatch) {
    month = Number(usMatch[1]);
    day = Number(usMatch[2]);
    year = Number(usMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    return "";
  }
  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";
  if (year < 1900 || year > new Date().getFullYear()) return "";
  // Validate the day is real for the month (handles Feb 30, etc.).
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return "";
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

/*
 * Renders a YYYY-MM-DD date string into a friendly format like 'June 12, 2002'
 * for the inline confirmation under the picker.
 */
function formatDobDisplay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// This iteration of Clawnection focuses on men and women seeking each other.
// Broader options will return — kept narrow here to make testing tractable.
const genderOptions = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
] as const;

// `preference` is auto-derived from gender for this iteration; the choice array
// stays so existing call paths still resolve, but the UI hides the step.
const preferenceOptions = [
  { value: "Women", label: "Women" },
  { value: "Men", label: "Men" },
] as const;

const intentOptions: ReadonlyArray<{
  value: RelationshipIntent;
  label: string;
  blurb: string;
}> = [
  { value: "long-term", label: "Long-term", blurb: "Looking for something serious." },
  { value: "serious-dating", label: "Serious dating", blurb: "Open to a real relationship." },
  { value: "exploring", label: "Exploring", blurb: "Seeing what feels right." },
  { value: "casual", label: "Casual / hookups", blurb: "Short-term, no pressure." },
  { value: "friendship-first", label: "Friends first", blurb: "Connection over romance." },
];

const occupationTypeOptions = [
  { value: "work" as const, label: "I work", blurb: "Tell us where" },
  { value: "school" as const, label: "I'm in school", blurb: "Where do you study?" },
];

const vapiApiKey = process.env.NEXT_PUBLIC_VAPI_API_KEY || "9058d621-d733-4b05-b4b0-c6e2a8ed549b";
const vapiAssistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || "d1f8ed5a-69dd-45b4-8d1b-641df6d15051";

function messageText(message: unknown): string {
  if (typeof message !== "object" || message === null || !("text" in message)) return "";
  const text = (message as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

// Light, format-friendly phone normalization. We don't validate carrier-correctness.
function normalizePhone(input: string): string {
  return input.replace(/[^\d+]/g, "");
}

function formatPhoneDisplay(input: string): string {
  // Allows the user to see digit grouping while typing US-shaped numbers; non-US users keep raw +/digits.
  const digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("+")) return "+" + digits;
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+${digits.slice(0, digits.length - 10)} (${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;
}

export default function VoiceOnboardingPage() {
  // Soft-disable: when the feature flag is off, render a notice page
  // instead of the voice flow. The infrastructure below (Vapi integration,
  // step state machine, transcript handling) is intentionally preserved
  // so re-enabling is a one-flag flip. To turn voice onboarding back on:
  //   1. Set NEXT_PUBLIC_VOICE_ONBOARDING_ENABLED=true in .env.local
  //   2. Wire up a working Vapi production account + webhook
  //   3. Rebuild
  if (!VOICE_ONBOARDING_ENABLED) {
    return <VoiceOnboardingDisabledNotice />;
  }
  return <VoiceOnboardingActive />;
}

function VoiceOnboardingDisabledNotice() {
  return (
    <PhoneShell>
      <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-10 text-[var(--text-primary)]">
        <header className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            Voice onboarding
          </p>
          <h1 className="text-3xl font-black leading-tight tracking-[-0.04em]">
            Temporarily disabled.
          </h1>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            We&rsquo;re wiring up a production Vapi account before turning
            this back on. The voice agent that walks you through your
            persona is built and ready — just not connected to a working
            voice provider in this deployment.
          </p>
        </header>

        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Use the text form instead
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Same persona, same fields, ~2 minutes. You&rsquo;ll be matched
            with the same agent fleet and end up on the same dashboards.
          </p>
          <Link
            href="/onboarding"
            className="primary-button mt-4 inline-flex w-full items-center justify-center"
          >
            Build your profile →
          </Link>
        </section>

        <p className="text-xs leading-5 text-[var(--text-muted)]">
          Heads-up for developers: the voice flow lives in this same file
          and is gated behind <code>NEXT_PUBLIC_VOICE_ONBOARDING_ENABLED</code>.
          Set it to <code>true</code> and rebuild to re-enable locally.
        </p>
      </main>
    </PhoneShell>
  );
}

function VoiceOnboardingActive() {
  const router = useRouter();
  const vapiRef = useRef<Vapi | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<ProfileData>({});

  // Stable id created once per onboarding session so every partial sync to
  // /api/profiles upserts the same row in D1, and so the Vapi webhook (which
  // receives this id as a variable value) can attach persona data to the same
  // row. Lazy initializer ensures the value is created exactly once and is
  // stable across re-renders.
  const [profileId] = useState<string>(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `voice-${crypto.randomUUID()}`
      : `voice-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  );

  const [step, setStep] = useState<StepId>("welcome");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  // Default the DOB to the latest valid date — i.e. 18 years ago today — so
  // the system date picker opens anchored at the age-18 boundary instead of
  // today's date. Users scroll back from there to their actual birth year.
  // ISO YYYY-MM-DD form (used internally for age calculation + persistence).
  // Empty until the user types a parseable date.
  const [dob, setDob] = useState<string>("");
  // Raw user input as typed. Lets the user type freely without us forcing a
  // formatted display in the middle of typing.
  const [dobInput, setDobInput] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [occupationType, setOccupationType] = useState<"work" | "school" | "">("");
  const [occupationPlace, setOccupationPlace] = useState("");
  const [gender, setGender] = useState("");
  const [preference, setPreference] = useState("");
  const [intent, setIntent] = useState<RelationshipIntent | "">("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [instagram, setInstagram] = useState("");
  const [linkedin, setLinkedin] = useState("");

  const [isCallActive, setIsCallActive] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({});
  const [error, setError] = useState<string | null>(() =>
    vapiApiKey ? null : "Voice onboarding is not configured. NEXT_PUBLIC_VAPI_API_KEY is missing.",
  );

  const stepIndex = useMemo(() => STEP_ORDER.indexOf(step), [step]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    document.title = "Onboarding · Clawnection";
  }, []);

  const ageNumber = computeAgeFromIsoDate(dob);
  const dobIsComplete = Boolean(dob);
  const ageIsValid = ageNumber >= 18 && ageNumber <= 120;
  const phoneDigitsOnly = phone.replace(/\D/g, "");
  const phoneIsValid = phoneDigitsOnly.length >= 7 && phoneDigitsOnly.length <= 15;

  /*
   * Merge the form fields the user has typed so far with whatever the voice
   * agent extracted (`data`) into a single RomanticProfile record. Form-typed
   * values win because the user explicitly chose them; voice-extracted values
   * fill in the long-form sections (bio, interests, values, etc.).
   */
  const buildProfile = useCallback(
    (data: ProfileData): RomanticProfile => {
      const occupation: Occupation | undefined =
        data.occupation
          ? data.occupation
          : occupationType
            ? { type: occupationType, place: occupationPlace }
            : undefined;

      return {
        id: profileId,
        name: firstName || data.name || "You",
        lastName: lastName || data.lastName || undefined,
        age: ageNumber || data.age || 0,
        phoneNumber: phone ? normalizePhone(phone) : data.phoneNumber || undefined,
        genderIdentity: gender || data.genderIdentity || "",
        lookingFor: data.lookingFor || preference || "",
        location: location || data.location || "",
        occupation,
        photoUrl: photoUrl || undefined,
        instagram: instagram || data.instagram || undefined,
        linkedin: linkedin || data.linkedin || undefined,
        relationshipIntent: (intent || data.relationshipIntent || "long-term") as RelationshipIntent,
        bio: data.bio || "",
        interests: data.interests || [],
        values: data.values || [],
        communicationStyle: data.communicationStyle || "balanced",
        lifestyleHabits: {
          sleepSchedule: data.sleepSchedule || "flexible",
          socialEnergy: data.socialEnergy || "balanced",
          activityLevel: data.activityLevel || "active",
          drinking: data.drinking || "social",
          smoking: data.smoking || "never",
        },
        dealbreakers: data.dealbreakers || [],
        idealFirstDate: data.idealFirstDate || "",
        preferenceAgeRange: {
          min: data.preferenceMinAge || 24,
          max: data.preferenceMaxAge || 38,
        },
        preferenceNotes: data.preferenceNotes || "",
        agentType: data.agentType || "hosted",
      };
    },
    [
      ageNumber,
      firstName,
      gender,
      instagram,
      intent,
      lastName,
      linkedin,
      location,
      occupationPlace,
      occupationType,
      phone,
      photoUrl,
      preference,
      profileId,
    ],
  );

  /*
   * Persist what we have so far. Called when the user reaches the voice step
   * (so the form-only data lands in D1 even if they never start the call) and
   * when the voice call ends (to merge in everything the agent extracted).
   */
  const persistProfile = useCallback(
    (data: ProfileData = {}) => {
      const profile = buildProfile(data);
      saveProfile(profile);
      syncProfileToServer(profile);
      return profile;
    },
    [buildProfile],
  );

  /*
   * Called only when the voice call ends — finalizes the profile, then
   * redirects to the persona page so the user can review the call output
   * (portrait, signals, voice samples) generated by the Vapi webhook.
   */
  const finalizeAndRedirect = useCallback(
    (data: ProfileData) => {
      const profile = persistProfile(data);
      setIsComplete(true);
      setTimeout(() => router.push(`/persona?profileId=${encodeURIComponent(profile.id)}`), 1800);
    },
    [persistProfile, router],
  );

  useEffect(() => {
    if (!vapiApiKey) return;

    vapiRef.current = new Vapi(vapiApiKey);
    const vapi = vapiRef.current;

    vapi.on("call-start", () => setIsCallActive(true));

    vapi.on("call-end", () => {
      setIsCallActive(false);
      setIsAssistantSpeaking(false);
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
      finalizeAndRedirect(profileRef.current);
    });

    vapi.on("speech-start", () => setIsAssistantSpeaking(true));
    vapi.on("speech-end", () => setIsAssistantSpeaking(false));

    vapi.on("message", (message: unknown) => {
      const text = messageText(message);
      const jsonMatch = text.match(/PROFILE_DATA:\s*(\{.*\})/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          setProfile(data);
          profileRef.current = data;
        } catch {
          // Ignore malformed assistant JSON; the call can continue safely.
        }
      }
    });

    vapi.on("error", (err: unknown) => {
      console.error("Vapi error:", err);
      setIsCallActive(false);
      setIsAssistantSpeaking(false);
      setError("The voice call stopped unexpectedly. Tap the orb to try again.");
    });

    return () => {
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      vapi.stop();
    };
  }, [finalizeAndRedirect]);

  function goNext() {
    setError(null);

    const next = STEP_ORDER[stepIndex + 1];
    if (next) setStep(next);
  }

  // When the user reaches the voice step, eagerly sync everything they typed
  // so the row exists in D1 even if they never start (or finish) the voice call.
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (step === "voice" && !hasSyncedRef.current && firstName.trim() && location.trim()) {
      hasSyncedRef.current = true;
      persistProfile({});
    }
  }, [step, firstName, location, persistProfile]);

  function goBack() {
    setError(null);
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  }

  async function startVoiceCall() {
    if (!vapiRef.current) {
      setError("Voice onboarding is not initialized. Check NEXT_PUBLIC_VAPI_API_KEY.");
      return;
    }
    if (!vapiAssistantId) {
      setError("Voice onboarding is not configured. NEXT_PUBLIC_VAPI_ASSISTANT_ID is missing.");
      return;
    }

    setError(null);
    callTimeoutRef.current = setTimeout(() => {
      vapiRef.current?.stop();
    }, 30 * 60 * 1000);

    try {
      // Persist the in-progress profile to D1 *before* starting the call so the
      // Vapi webhook (which receives `profileId` as a variable value) can find
      // an existing row to attach persona data to once the call ends.
      persistProfile({});

      const occupationDetail =
        occupationType === "work"
          ? `they work${occupationPlace ? ` at ${occupationPlace}` : ""}`
          : occupationType === "school"
            ? `they study${occupationPlace ? ` at ${occupationPlace}` : ""}`
            : "";
      const intentLabel = intentOptions.find((o) => o.value === intent)?.label.toLowerCase() ?? "long-term";
      const firstMessage = `Hey ${firstName}. This is Clawnection. You said you're ${ageNumber}, based in ${location}${occupationDetail ? `, and ${occupationDetail}` : ""}. You identify as ${gender}, you're interested in ${preference}, and you're here for ${intentLabel}. We'll have a guided conversation to round out your dating profile. There are no right answers. To begin — what does an amazing first date look like for you?`;
      await vapiRef.current.start(vapiAssistantId, {
        firstMessage,
        variableValues: {
          profileId,
          name: firstName,
          gender,
          sexual_preference: preference,
        },
      });
    } catch {
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
      setError("Failed to start the call. Please try again.");
    }
  }

  function endVoiceCall() {
    vapiRef.current?.stop();
  }

  const continueDisabled =
    (step === "name" && (!firstName.trim() || !lastName.trim())) ||
    (step === "dob" && !ageIsValid) ||
    (step === "phone" && !phoneIsValid) ||
    (step === "location" && !location.trim()) ||
    (step === "occupationType" && !occupationType) ||
    (step === "occupationPlace" && !occupationPlace.trim()) ||
    (step === "gender" && !gender) ||
    (step === "preference" && !preference) ||
    (step === "intent" && !intent);

  return (
    <PhoneShell>
      <main className="screen-padding flex min-h-dvh flex-col gap-8">
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            {stepIndex > 0 && step !== "voice" && !isCallActive ? (
              <button
                type="button"
                onClick={goBack}
                className="text-sm font-bold text-white/68 hover:text-white"
                aria-label="Go back to the previous step"
              >
                ← Back
              </button>
            ) : (
              <Link href="/" className="text-sm font-bold text-white/58" aria-label="Clawnection home">
                Clawnection
              </Link>
            )}
          </div>

          <PhaseProgress currentStep={step} />
        </header>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-300/40 bg-red-500/12 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {step === "welcome" && (
          <section className="flex flex-1 flex-col justify-between gap-8">
            <div className="space-y-5">
              <h1 className="text-5xl font-black leading-[0.95] tracking-[-0.05em] text-white">
                Let&apos;s build your<br />claw<span className="claw-text-gradient">nection</span> profile.
              </h1>
              <p className="text-base leading-7 text-white/70">
                A few quick taps, then a short voice chat with your AI assistant. No long forms — your agent learns you naturally.
              </p>
            </div>

            <div className="space-y-3">
              <button type="button" onClick={goNext} className="primary-button w-full">
                Get started
              </button>
              <p className="text-center text-xs text-white/52">
                Takes about a minute. End the voice call anytime.
              </p>
            </div>
          </section>
        )}

        {step === "name" && (
          <StepLayout
            title="What's your name?"
            description="Last names stay private until you and a match both agree to share."
            onContinue={goNext}
            continueDisabled={continueDisabled}
          >
            <label className="grid gap-1 text-sm font-bold text-white/84">
              <span className="text-xs uppercase tracking-[0.18em] text-white/52">First name</span>
              <input
                className="field text-lg"
                value={firstName}
                onChange={(event) => setFirstName(capitalizeName(event.target.value))}
                placeholder="First name"
                autoFocus
                autoComplete="given-name"
                autoCapitalize="words"
                spellCheck={false}
                aria-label="First name"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-white/84">
              <span className="text-xs uppercase tracking-[0.18em] text-white/52">Last name</span>
              <input
                className="field text-lg"
                value={lastName}
                onChange={(event) => setLastName(capitalizeName(event.target.value))}
                placeholder="Last name"
                autoComplete="family-name"
                autoCapitalize="words"
                spellCheck={false}
                aria-label="Last name"
              />
            </label>
          </StepLayout>
        )}

        {step === "dob" && (
          <StepLayout
            title="When's your birthday?"
            description="You must be 18 or older to use Clawnection. We only show your age, not your full birthday."
            onContinue={goNext}
            continueDisabled={continueDisabled}
            error={dobIsComplete && !ageIsValid ? "You must be 18 or older to continue." : undefined}
          >
            <label className="grid gap-1 text-sm font-bold text-white/84">
              <span className="text-xs uppercase tracking-[0.18em] text-white/52">Date of birth</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                placeholder="MM/DD/YYYY"
                className="field text-lg"
                value={dobInput}
                onChange={(event) => {
                  const raw = event.target.value;
                  setDobInput(raw);
                  setDob(parseDobInput(raw));
                }}
                aria-label="Date of birth, MM slash DD slash YYYY"
              />
            </label>
            {dob && ageIsValid ? (
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/52">
                {formatDobDisplay(dob)} · you&apos;ll be shown as {ageNumber}
              </p>
            ) : null}
          </StepLayout>
        )}

        {step === "phone" && (
          <StepLayout
            title="What's your phone number?"
            description="We use it for verification and account recovery — never shared with matches."
            onContinue={goNext}
            continueDisabled={continueDisabled}
          >
            <input
              className="field text-lg"
              value={phone}
              onChange={(event) => setPhone(formatPhoneDisplay(event.target.value))}
              placeholder="(555) 555-1234"
              type="tel"
              inputMode="tel"
              autoFocus
              autoComplete="tel"
              aria-label="Phone number"
            />
          </StepLayout>
        )}

        {step === "location" && (
          <StepLayout
            title="Where do you live?"
            description="City and state, or city and country. We use it to find nearby matches."
            onContinue={goNext}
            continueDisabled={continueDisabled}
          >
            <input
              className="field text-lg"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Cambridge, MA"
              autoFocus
              autoComplete="address-level2"
              aria-label="Location"
            />
          </StepLayout>
        )}

        {step === "occupationType" && (
          <StepLayout
            title="What's your day job?"
            onContinue={goNext}
            continueDisabled={continueDisabled}
          >
            <div className="grid gap-3">
              {occupationTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="option-tile"
                  data-selected={occupationType === option.value}
                  onClick={() => setOccupationType(option.value)}
                >
                  <span>
                    <span className="block text-base font-bold text-white">{option.label}</span>
                    <span className="block text-xs text-white/56">{option.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </StepLayout>
        )}

        {step === "occupationPlace" && (
          <StepLayout
            title={
              occupationType === "school" ? "Where do you study?" : "Where do you work?"
            }
            description={
              occupationType === "school"
                ? "School or university name."
                : "Company or what you do — your call."
            }
            onContinue={goNext}
            continueDisabled={continueDisabled}
          >
            <input
              className="field text-lg"
              value={occupationPlace}
              onChange={(event) => setOccupationPlace(event.target.value)}
              placeholder={occupationType === "school" ? "e.g. MIT" : "e.g. Anthropic"}
              autoFocus
              autoComplete="organization"
              aria-label={occupationType === "school" ? "School name" : "Work place"}
            />
          </StepLayout>
        )}

        {step === "gender" && (
          <StepLayout
            title="I am a..."
            description="This iteration of Clawnection focuses on men and women seeking each other. Broader options are coming."
            onContinue={goNext}
            continueDisabled={continueDisabled}
          >
            <div className="grid gap-3">
              {genderOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="option-tile"
                  data-selected={gender === option.value}
                  onClick={() => {
                    setGender(option.value);
                    // Auto-set preference for this iteration (heterosexual only).
                    setPreference(option.value === "Male" ? "Women" : "Men");
                  }}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </StepLayout>
        )}

        {step === "preference" && (
          <StepLayout
            title="I'm attracted to..."
            description="This helps your agent line up the right virtual dates."
            onContinue={goNext}
            continueDisabled={continueDisabled}
          >
            <div className="grid gap-3">
              {preferenceOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="option-tile"
                  data-selected={preference === option.value}
                  onClick={() => setPreference(option.value)}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </StepLayout>
        )}

        {step === "intent" && (
          <StepLayout
            title="What kind of relationship?"
            description="Be honest — your agent will only match you with people who want similar things."
            onContinue={goNext}
            continueDisabled={continueDisabled}
          >
            <div className="grid gap-3">
              {intentOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="option-tile"
                  data-selected={intent === option.value}
                  onClick={() => setIntent(option.value)}
                >
                  <span>
                    <span className="block text-base font-bold text-white">{option.label}</span>
                    <span className="block text-xs text-white/56">{option.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </StepLayout>
        )}

        {step === "photo" && (
          <StepLayout
            title="Add a profile photo"
            description="One clear photo of you. We never share it with matches until you both opt in."
            onContinue={goNext}
            continueDisabled={false}
            continueLabel={photoUrl ? "Continue" : "Skip for now"}
            error={photoError ?? undefined}
          >
            <PhotoPicker
              photoUrl={photoUrl}
              onChange={(value) => {
                setPhotoError(null);
                setPhotoUrl(value);
              }}
              onError={(message) => setPhotoError(message)}
            />
          </StepLayout>
        )}

        {step === "socials" && (
          <StepLayout
            title="Add your socials?"
            description="Totally optional — you can add or remove these any time. Only shared after you both opt in."
            onContinue={goNext}
            continueDisabled={false}
            continueLabel={instagram || linkedin ? "Continue" : "Skip for now"}
          >
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-bold text-white/84">
                <span className="text-xs uppercase tracking-[0.18em] text-white/52">Instagram</span>
                <input
                  className="field"
                  value={instagram}
                  onChange={(event) => setInstagram(event.target.value.replace(/^@/, ""))}
                  placeholder="@yourhandle"
                  autoComplete="off"
                  aria-label="Instagram handle"
                />
              </label>
              <label className="grid gap-1 text-sm font-bold text-white/84">
                <span className="text-xs uppercase tracking-[0.18em] text-white/52">LinkedIn</span>
                <input
                  className="field"
                  value={linkedin}
                  onChange={(event) => setLinkedin(event.target.value)}
                  placeholder="linkedin.com/in/you"
                  autoComplete="off"
                  aria-label="LinkedIn URL or handle"
                />
              </label>
            </div>
          </StepLayout>
        )}

        {step === "voice" && (
          <section className="flex flex-1 flex-col items-center justify-between gap-10 text-center">
            <div className="space-y-3">
              <h1 className="text-4xl font-black leading-[1] tracking-[-0.04em] text-white">
                {isComplete
                  ? "Profile saved."
                  : isCallActive
                    ? "Just speak naturally."
                    : `Ready, ${firstName || "friend"}?`}
              </h1>
              <p className="mx-auto max-w-[28ch] text-sm leading-6 text-white/66">
                {isComplete
                  ? "Heading to your virtual date demo…"
                  : isCallActive
                    ? "Your agent is listening. Tell it about your life, what you want, and what you avoid."
                    : "Tap the orb to start a short voice intro. End anytime."}
              </p>
            </div>

            <VoiceOrb
              active={isCallActive}
              disabled={isComplete}
              onClick={isCallActive ? endVoiceCall : startVoiceCall}
              ariaLabel={isCallActive ? "End voice call" : "Start voice call"}
            />

            <div className="w-full space-y-3">
              <p
                role="status"
                aria-live="polite"
                className="text-xs font-bold uppercase tracking-[0.18em] text-white/52"
              >
                {isCallActive
                  ? isAssistantSpeaking
                    ? "Assistant speaking"
                    : "Microphone live"
                  : isComplete
                    ? "Saved"
                    : "Tap orb to begin"}
              </p>
              {isCallActive && (
                <button
                  type="button"
                  onClick={endVoiceCall}
                  className="secondary-button w-full"
                >
                  End call
                </button>
              )}
              {!isCallActive && !isComplete && (
                <p className="text-center text-xs text-white/48">
                  Auto-ends after 30 minutes. Prefer typing?{" "}
                  <Link href="/onboarding" className="font-bold text-white underline underline-offset-4">
                    Use the form
                  </Link>
                  .
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </PhoneShell>
  );
}

function PhaseProgress({ currentStep }: { currentStep: StepId }) {
  const segments = getPhaseProgress(currentStep);
  const activePhase = segments.find((s) => s.state === "active")?.phase ?? PHASES[0];
  const allDone = currentStep === "voice";

  return (
    <div className="space-y-2">
      <div className="phase-progress" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={segments.filter((s) => s.state === "done").length + (allDone ? 1 : 0)}>
        {segments.map(({ phase, state, fillRatio }) => (
          <div key={phase.id} className="phase-progress-segment" data-state={state}>
            <span
              className="phase-progress-fill"
              style={state === "active" ? { width: `${fillRatio * 100}%` } : undefined}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em]">
        {segments.map(({ phase, state }) => (
          <span
            key={phase.id}
            className={
              state === "done"
                ? "text-white/82"
                : state === "active"
                  ? "text-white"
                  : "text-white/30"
            }
          >
            {state === "done" ? phase.doneLabel : state === "active" ? phase.inProgressLabel : phase.label}
          </span>
        ))}
      </div>
      <p
        aria-live="polite"
        className="text-xs text-white/52"
      >
        {allDone ? "🎉 You did it." : activePhase.id === "basics" ? "Quick basics — almost nothing to fill in." : activePhase.id === "vibe" ? "Now the fun stuff. Show your vibe." : "Time to meet your AI agent."}
      </p>
    </div>
  );
}

function StepLayout({
  title,
  description,
  children,
  onContinue,
  continueDisabled,
  continueLabel = "Continue",
  error,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onContinue: () => void;
  continueDisabled: boolean;
  continueLabel?: string;
  error?: string;
}) {
  return (
    <section className="flex flex-1 flex-col justify-between gap-8">
      <div className="space-y-5">
        <h1 className="text-4xl font-black leading-[1] tracking-[-0.04em] text-white">{title}</h1>
        {description ? <p className="text-sm leading-6 text-white/62">{description}</p> : null}
        <div className="space-y-3">{children}</div>
        {error ? (
          <p role="alert" className="rounded-2xl border border-red-300/40 bg-red-500/12 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled}
        className="primary-button w-full"
      >
        {continueLabel}
      </button>
    </section>
  );
}
