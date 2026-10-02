import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Occupation, RomanticProfile } from "@/lib/types/matching";


export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const profile: RomanticProfile = await req.json();

  await db
    .prepare(
      `INSERT INTO profiles (
        id, name, last_name, age, phone_number, gender_identity, looking_for, location,
        occupation_type, occupation_place, photo_url, instagram, linkedin,
        relationship_intent, bio, interests, profile_values,
        communication_style, lifestyle_habits, dealbreakers,
        ideal_first_date, preference_age_min, preference_age_max,
        preference_notes, agent_type, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
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
        updated_at = datetime('now')`,
    )
    .bind(
      profile.id,
      profile.name,
      profile.lastName ?? null,
      profile.age,
      profile.phoneNumber ?? null,
      profile.genderIdentity,
      profile.lookingFor,
      profile.location,
      profile.occupation?.type ?? null,
      profile.occupation?.place ?? null,
      profile.photoUrl ?? null,
      profile.instagram ?? null,
      profile.linkedin ?? null,
      profile.relationshipIntent,
      profile.bio,
      JSON.stringify(profile.interests),
      JSON.stringify(profile.values),
      profile.communicationStyle,
      JSON.stringify(profile.lifestyleHabits),
      JSON.stringify(profile.dealbreakers),
      profile.idealFirstDate,
      profile.preferenceAgeRange.min,
      profile.preferenceAgeRange.max,
      profile.preferenceNotes,
      profile.agentType,
    )
    .run();

  return NextResponse.json({ ok: true, id: profile.id });
}

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    const { results } = await db
      .prepare("SELECT * FROM profiles ORDER BY created_at DESC LIMIT 20")
      .all();

    const profiles = (results ?? []).map((row: Record<string, unknown>) => rowToProfile(row));
    return NextResponse.json({ profiles });
  }

  const row = await db.prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(rowToProfile(row));
}

function rowToProfile(row: Record<string, unknown>): RomanticProfile {
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
    bio: row.bio as string,
    interests: JSON.parse((row.interests as string) || "[]"),
    values: JSON.parse((row.profile_values as string) || "[]"),
    communicationStyle: row.communication_style as RomanticProfile["communicationStyle"],
    lifestyleHabits: JSON.parse((row.lifestyle_habits as string) || "{}"),
    dealbreakers: JSON.parse((row.dealbreakers as string) || "[]"),
    idealFirstDate: row.ideal_first_date as string,
    preferenceAgeRange: {
      min: row.preference_age_min as number,
      max: row.preference_age_max as number,
    },
    preferenceNotes: row.preference_notes as string,
    agentType: row.agent_type as RomanticProfile["agentType"],
  };
}
