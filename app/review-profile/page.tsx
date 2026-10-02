"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingSection } from "@/components/OnboardingSection";
import { AppHeader } from "@/components/AppHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { loadProfile, saveProfile, syncProfileToServer } from "@/lib/storage";
import {
  CommunicationStyle,
  RelationshipIntent,
  RomanticProfile,
} from "@/lib/types/matching";

type FormState = {
  name: string;
  age: string;
  genderIdentity: string;
  lookingFor: string;
  location: string;
  relationshipIntent: RelationshipIntent;
  bio: string;
  interests: string;
  values: string;
  communicationStyle: CommunicationStyle;
  sleepSchedule: RomanticProfile["lifestyleHabits"]["sleepSchedule"];
  socialEnergy: RomanticProfile["lifestyleHabits"]["socialEnergy"];
  activityLevel: RomanticProfile["lifestyleHabits"]["activityLevel"];
  drinking: RomanticProfile["lifestyleHabits"]["drinking"];
  smoking: RomanticProfile["lifestyleHabits"]["smoking"];
  dealbreakers: string;
  idealFirstDate: string;
  preferenceMinAge: string;
  preferenceMaxAge: string;
  preferenceNotes: string;
  agentType: RomanticProfile["agentType"];
};

const defaultForm: FormState = {
  name: "",
  age: "",
  genderIdentity: "",
  lookingFor: "",
  location: "",
  relationshipIntent: "long-term",
  bio: "",
  interests: "",
  values: "",
  communicationStyle: "balanced",
  sleepSchedule: "flexible",
  socialEnergy: "balanced",
  activityLevel: "active",
  drinking: "social",
  smoking: "never",
  dealbreakers: "",
  idealFirstDate: "",
  preferenceMinAge: "24",
  preferenceMaxAge: "38",
  preferenceNotes: "",
  // Default to hosted: the friction-free entry point. Users can switch on
  // /connect-agent if they prefer to bring their own runtime.
  agentType: "hosted",
};

const fieldClass = "input-obsidian mt-1";
const textareaClass = `${fieldClass} min-h-[5rem] resize-y`;

function profileToForm(p: RomanticProfile): FormState {
  return {
    name: p.name,
    age: String(p.age),
    genderIdentity: p.genderIdentity,
    lookingFor: p.lookingFor,
    location: p.location,
    relationshipIntent: p.relationshipIntent,
    bio: p.bio,
    interests: p.interests.join(", "),
    values: p.values.join(", "),
    communicationStyle: p.communicationStyle,
    sleepSchedule: p.lifestyleHabits.sleepSchedule,
    socialEnergy: p.lifestyleHabits.socialEnergy,
    activityLevel: p.lifestyleHabits.activityLevel,
    drinking: p.lifestyleHabits.drinking,
    smoking: p.lifestyleHabits.smoking,
    dealbreakers: p.dealbreakers.join(", "),
    idealFirstDate: p.idealFirstDate,
    preferenceMinAge: String(p.preferenceAgeRange.min),
    preferenceMaxAge: String(p.preferenceAgeRange.max),
    preferenceNotes: p.preferenceNotes,
    agentType: p.agentType,
  };
}

function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ReviewProfileForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromVoice = searchParams.get("from") === "voice";

  const [profileId, setProfileId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isVoicePrefilled, setIsVoicePrefilled] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Always rehydrate any previously saved profile (voice flow OR returning
    // visitor). Name / age / gender / location should persist across visits.
    const existing = loadProfile();
    if (existing) {
      setProfileId(existing.id);
      setForm(profileToForm(existing));
      if (fromVoice) setIsVoicePrefilled(true);
    }
    setReady(true);
  }, [fromVoice]);

  if (!ready) return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name || !form.age || !form.location || !form.bio) {
      setError("Please complete all required fields before continuing.");
      return;
    }

    const age = Number(form.age);
    if (Number.isNaN(age) || age < 18 || age > 100) {
      setError("Please enter a valid age between 18 and 100.");
      return;
    }

    const min = Number(form.preferenceMinAge);
    const max = Number(form.preferenceMaxAge);
    if (Number.isNaN(min) || Number.isNaN(max) || min < 18 || max < min) {
      setError("Preference age range is invalid. Confirm min and max ages.");
      return;
    }

    const id =
      profileId ?? `local-${form.name.toLowerCase().replace(/\s+/g, "-")}`;

    const profile: RomanticProfile = {
      id,
      name: form.name,
      age,
      genderIdentity: form.genderIdentity,
      lookingFor: form.lookingFor,
      location: form.location,
      relationshipIntent: form.relationshipIntent,
      bio: form.bio,
      interests: parseCsv(form.interests),
      values: parseCsv(form.values),
      communicationStyle: form.communicationStyle,
      lifestyleHabits: {
        sleepSchedule: form.sleepSchedule,
        socialEnergy: form.socialEnergy,
        activityLevel: form.activityLevel,
        drinking: form.drinking,
        smoking: form.smoking,
      },
      dealbreakers: parseCsv(form.dealbreakers),
      idealFirstDate: form.idealFirstDate,
      preferenceAgeRange: { min, max },
      preferenceNotes: form.preferenceNotes,
      agentType: form.agentType,
    };

    setSaving(true);
    saveProfile(profile);

    try {
      await syncProfileToServer(profile);
    } catch {
      setSaving(false);
      setError(
        "Profile saved locally but failed to sync to the server. You can continue, but your data may not persist across devices.",
      );
      return;
    }

    setSaving(false);
    // Both Hosted and Bring-your-own land on /connect-agent — that page is
    // the shared launchpad with both paths as first-class options.
    router.push(`/connect-agent?profileId=${encodeURIComponent(profile.id)}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 pb-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          {isVoicePrefilled ? "Review profile" : "Create profile"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {isVoicePrefilled ? "Does this look right?" : "Create your profile"}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {isVoicePrefilled
            ? "We pulled this from your voice conversation. Review everything below and fix anything that doesn\u2019t look accurate before continuing."
            : "Build your romance profile from scratch. Your personal agent will represent your preferences during structured virtual introductions."}
        </p>
      </header>

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <OnboardingSection
          title="Core profile"
          description="Basics used for introductions and baseline matching."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-[var(--text-secondary)]">
              Name (required)
              <input
                className={fieldClass}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-[var(--text-secondary)]">
              Age (required)
              <input
                className={fieldClass}
                inputMode="numeric"
                value={form.age}
                onChange={(e) => update("age", e.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-[var(--text-secondary)] sm:col-span-2">
              Gender (required)
              <select
                className={fieldClass}
                value={form.genderIdentity}
                onChange={(e) => {
                  const g = e.target.value;
                  update("genderIdentity", g);
                  // Auto-derive lookingFor for this iteration (heterosexual matching only).
                  if (g === "Male") update("lookingFor", "Women");
                  else if (g === "Female") update("lookingFor", "Men");
                }}
                required
              >
                <option value="">Select…</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
              <span className="mt-1 block text-xs text-[var(--text-muted)]">
                This iteration of Clawnection focuses on men and women seeking each other. Broader options are coming.
              </span>
            </label>
            <label className="block text-sm text-[var(--text-secondary)] sm:col-span-2">
              Location (required)
              <input
                className={fieldClass}
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                required
              />
            </label>
          </div>
        </OnboardingSection>

        <OnboardingSection
          title="Connection preferences"
          description="What you want and how you relate."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-[var(--text-secondary)]">
              Relationship intent
              <select
                className={fieldClass}
                value={form.relationshipIntent}
                onChange={(e) =>
                  update(
                    "relationshipIntent",
                    e.target.value as RelationshipIntent,
                  )
                }
              >
                <option value="long-term">Long-term</option>
                <option value="serious-dating">Serious dating</option>
                <option value="exploring">Exploring</option>
                <option value="friendship-first">Friendship first</option>
              </select>
            </label>
            <label className="block text-sm text-[var(--text-secondary)]">
              Communication style
              <select
                className={fieldClass}
                value={form.communicationStyle}
                onChange={(e) =>
                  update(
                    "communicationStyle",
                    e.target.value as CommunicationStyle,
                  )
                }
              >
                <option value="balanced">Balanced</option>
                <option value="direct">Direct</option>
                <option value="warm">Warm</option>
                <option value="playful">Playful</option>
                <option value="reflective">Reflective</option>
              </select>
            </label>
            <label className="block text-sm text-[var(--text-secondary)] sm:col-span-2">
              Short bio (required)
              <textarea
                className={textareaClass}
                rows={3}
                value={form.bio}
                onChange={(e) => update("bio", e.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-[var(--text-secondary)]">
              Interests (comma-separated)
              <input
                className={fieldClass}
                value={form.interests}
                onChange={(e) => update("interests", e.target.value)}
              />
            </label>
            <label className="block text-sm text-[var(--text-secondary)]">
              Values (comma-separated)
              <input
                className={fieldClass}
                value={form.values}
                onChange={(e) => update("values", e.target.value)}
              />
            </label>
          </div>
        </OnboardingSection>

        <OnboardingSection
          title="Lifestyle and boundaries"
          description="Practical signals that affect day-to-day fit."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                [
                  "sleepSchedule",
                  "Sleep schedule",
                  ["early-bird", "flexible", "night-owl"],
                ],
                [
                  "socialEnergy",
                  "Social energy",
                  ["low-key", "balanced", "high-energy"],
                ],
                [
                  "activityLevel",
                  "Activity level",
                  ["relaxed", "active", "very-active"],
                ],
                ["drinking", "Drinking", ["never", "social", "regular"]],
                [
                  "smoking",
                  "Smoking",
                  ["never", "occasionally", "regular"],
                ],
              ] as const
            ).map(([key, label, options]) => (
              <label
                key={key}
                className="block text-sm text-[var(--text-secondary)]"
              >
                {label}
                <select
                  className={fieldClass}
                  value={form[key]}
                  onChange={(e) =>
                    update(key, e.target.value as FormState[typeof key])
                  }
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="block text-sm text-[var(--text-secondary)] sm:col-span-2">
              Dealbreakers (comma-separated)
              <input
                className={fieldClass}
                value={form.dealbreakers}
                onChange={(e) => update("dealbreakers", e.target.value)}
              />
            </label>
            <label className="block text-sm text-[var(--text-secondary)] sm:col-span-2">
              Ideal first date
              <input
                className={fieldClass}
                value={form.idealFirstDate}
                onChange={(e) => update("idealFirstDate", e.target.value)}
              />
            </label>
          </div>
        </OnboardingSection>

        <OnboardingSection
          title="Match preferences and agent mode"
          description="Who you hope to meet and whether your agent is hosted here or external."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-[var(--text-secondary)]">
              Preferred minimum age
              <input
                className={fieldClass}
                value={form.preferenceMinAge}
                onChange={(e) => update("preferenceMinAge", e.target.value)}
              />
            </label>
            <label className="block text-sm text-[var(--text-secondary)]">
              Preferred maximum age
              <input
                className={fieldClass}
                value={form.preferenceMaxAge}
                onChange={(e) => update("preferenceMaxAge", e.target.value)}
              />
            </label>
            <label className="block text-sm text-[var(--text-secondary)] sm:col-span-2">
              Preference notes
              <textarea
                className={textareaClass}
                rows={2}
                value={form.preferenceNotes}
                onChange={(e) => update("preferenceNotes", e.target.value)}
              />
            </label>
            <fieldset className="sm:col-span-2 rounded-xl border border-[var(--border-subtle)] p-3">
              <legend className="px-1 text-sm font-medium text-[var(--text-primary)]">
                Agent type
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border-subtle)] p-3 text-sm text-[var(--text-secondary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent)]">
                  <input
                    type="radio"
                    className="mt-1 shrink-0"
                    checked={form.agentType === "hosted"}
                    onChange={() => update("agentType", "hosted")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[var(--text-primary)]">Hosted by Clawnection</span>
                    <span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">
                      We run your agent on our infrastructure — one click, no setup.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border-subtle)] p-3 text-sm text-[var(--text-secondary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent)]">
                  <input
                    type="radio"
                    className="mt-1 shrink-0"
                    checked={form.agentType === "external-mock"}
                    onChange={() => update("agentType", "external-mock")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[var(--text-primary)]">Bring your own agent</span>
                    <span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">
                      OpenClaw, ZeroClaw, Claude Desktop, or any HTTP-capable AI assistant.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          </div>
        </OnboardingSection>

        {error ? (
          <p
            className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full touch-target disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving
            ? "Saving..."
            : isVoicePrefilled
              ? "Looks good — continue"
              : "Save profile and continue"}
        </button>
      </form>
    </div>
  );
}

export default function ReviewProfilePage() {
  return (
    <PhoneShell label="Profile form">
      <AppHeader />
      <Suspense fallback={null}>
        <ReviewProfileForm />
      </Suspense>
    </PhoneShell>
  );
}
