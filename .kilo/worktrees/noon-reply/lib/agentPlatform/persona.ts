import type { Occupation, RomanticProfile } from "@/lib/types/matching";
import { generateProfileId } from "./auth";

export function rowToProfile(row: Record<string, unknown>): RomanticProfile {
  const occupationType = (row.occupation_type as string | null) ?? null;
  const occupationPlace = (row.occupation_place as string | null) ?? null;
  let occupation: Occupation | undefined;
  if (occupationType === "work" || occupationType === "school") {
    occupation = { type: occupationType, place: occupationPlace ?? "" };
  }

  return {
    id: row.id as string,
    name: row.name as string,
    lastName: (row.last_name as string | null) ?? undefined,
    age: row.age as number,
    phoneNumber: (row.phone_number as string | null) ?? undefined,
    genderIdentity: row.gender_identity as string,
    lookingFor: row.looking_for as string,
    location: row.location as string,
    occupation,
    photoUrl: (row.photo_url as string | null) ?? undefined,
    instagram: (row.instagram as string | null) ?? undefined,
    linkedin: (row.linkedin as string | null) ?? undefined,
    relationshipIntent: row.relationship_intent as RomanticProfile["relationshipIntent"],
    bio: (row.bio as string | null) ?? "",
    interests: safeJsonArray(row.interests),
    values: safeJsonArray(row.profile_values),
    communicationStyle: row.communication_style as RomanticProfile["communicationStyle"],
    lifestyleHabits: safeJsonObject(row.lifestyle_habits),
    dealbreakers: safeJsonArray(row.dealbreakers),
    idealFirstDate: (row.ideal_first_date as string | null) ?? "",
    preferenceAgeRange: {
      min: (row.preference_age_min as number | null) ?? 18,
      max: (row.preference_age_max as number | null) ?? 99,
    },
    preferenceNotes: (row.preference_notes as string | null) ?? "",
    agentType: (row.agent_type as RomanticProfile["agentType"]) ?? "external-mock",
    // Soft-signal fields (migration 0007). Only undefined when the
    // column is NULL — empty arrays / strings are returned as-is so
    // verdict prompts can detect "the user hasn't filled this in" vs
    // "the user has nothing to say here".
    petPeeves: row.pet_peeves != null ? safeJsonArray(row.pet_peeves) : undefined,
    currentLifeContext: (row.current_life_context as string | null) ?? undefined,
    wantsToAvoid: row.wants_to_avoid != null ? safeJsonArray(row.wants_to_avoid) : undefined,
    pastPatternToBreak: (row.past_pattern_to_break as string | null) ?? undefined,
  };
}

export async function upsertProfile(
  db: D1Database,
  profile: RomanticProfile,
): Promise<RomanticProfile> {
  const id = profile.id || generateProfileId();
  const final = { ...profile, id };
  await db
    .prepare(
      `INSERT INTO profiles (
        id, name, last_name, age, phone_number, gender_identity, looking_for, location,
        occupation_type, occupation_place, photo_url, instagram, linkedin,
        relationship_intent, bio, interests, profile_values,
        communication_style, lifestyle_habits, dealbreakers,
        ideal_first_date, preference_age_min, preference_age_max,
        preference_notes, agent_type,
        pet_peeves, current_life_context, wants_to_avoid, past_pattern_to_break,
        updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        last_name = excluded.last_name,
        age = excluded.age,
        phone_number = excluded.phone_number,
        gender_identity = excluded.gender_identity,
        looking_for = excluded.looking_for,
        location = excluded.location,
        occupation_type = excluded.occupation_type,
        occupation_place = excluded.occupation_place,
        photo_url = excluded.photo_url,
        instagram = excluded.instagram,
        linkedin = excluded.linkedin,
        relationship_intent = excluded.relationship_intent,
        bio = excluded.bio,
        interests = excluded.interests,
        profile_values = excluded.profile_values,
        communication_style = excluded.communication_style,
        lifestyle_habits = excluded.lifestyle_habits,
        dealbreakers = excluded.dealbreakers,
        ideal_first_date = excluded.ideal_first_date,
        preference_age_min = excluded.preference_age_min,
        preference_age_max = excluded.preference_age_max,
        preference_notes = excluded.preference_notes,
        agent_type = excluded.agent_type,
        pet_peeves = excluded.pet_peeves,
        current_life_context = excluded.current_life_context,
        wants_to_avoid = excluded.wants_to_avoid,
        past_pattern_to_break = excluded.past_pattern_to_break,
        updated_at = datetime('now')`,
    )
    .bind(
      final.id,
      final.name,
      final.lastName ?? null,
      final.age,
      final.phoneNumber ?? null,
      final.genderIdentity,
      final.lookingFor,
      final.location,
      final.occupation?.type ?? null,
      final.occupation?.place ?? null,
      final.photoUrl ?? null,
      final.instagram ?? null,
      final.linkedin ?? null,
      final.relationshipIntent,
      final.bio,
      JSON.stringify(final.interests ?? []),
      JSON.stringify(final.values ?? []),
      final.communicationStyle,
      JSON.stringify(final.lifestyleHabits ?? {}),
      JSON.stringify(final.dealbreakers ?? []),
      final.idealFirstDate,
      final.preferenceAgeRange.min,
      final.preferenceAgeRange.max,
      final.preferenceNotes,
      final.agentType,
      final.petPeeves !== undefined ? JSON.stringify(final.petPeeves) : null,
      final.currentLifeContext ?? null,
      final.wantsToAvoid !== undefined ? JSON.stringify(final.wantsToAvoid) : null,
      final.pastPatternToBreak ?? null,
    )
    .run();
  return final;
}

export async function fetchProfile(
  db: D1Database,
  id: string,
): Promise<RomanticProfile | null> {
  const row = await db
    .prepare("SELECT * FROM profiles WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? rowToProfile(row) : null;
}

function safeJsonArray<T = string>(value: unknown): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonObject<T = Record<string, unknown>>(value: unknown): T {
  if (!value) return {} as T;
  try {
    const parsed = JSON.parse(value as string);
    return (parsed && typeof parsed === "object") ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}
