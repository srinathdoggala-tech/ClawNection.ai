import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { RomanticProfile } from "@/lib/types/matching";
import type { WhatsAppSignals } from "@/lib/types/behavioral";
import {
  scoreProfiles,
  buildRecommendation,
  suggestFirstDate,
  DEFAULT_WEIGHTS,
} from "@/lib/matching/scoring";
import type { ScoringWeights } from "@/lib/matching/scoring";


function rowToProfile(row: Record<string, unknown>): RomanticProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    age: row.age as number,
    genderIdentity: row.gender_identity as string,
    lookingFor: row.looking_for as string,
    location: row.location as string,
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

export async function POST(req: NextRequest) {
  try {
    const { env } = getCloudflareContext();
    const cfEnv = env as unknown as CloudflareEnv;
    const db = cfEnv.DB;

    const body = await req.json();
    const { profileAId, profileBId } = body as { profileAId: string; profileBId: string };

    if (!profileAId || !profileBId) {
      return NextResponse.json({ error: "profileAId and profileBId are required" }, { status: 400 });
    }

    // Fetch both profiles from D1
    const [rowA, rowB] = await Promise.all([
      db.prepare("SELECT * FROM profiles WHERE id = ?").bind(profileAId).first(),
      db.prepare("SELECT * FROM profiles WHERE id = ?").bind(profileBId).first(),
    ]);

    if (!rowA) return NextResponse.json({ error: `Profile ${profileAId} not found` }, { status: 404 });
    if (!rowB) return NextResponse.json({ error: `Profile ${profileBId} not found` }, { status: 404 });

    const profileA = rowToProfile(rowA);
    const profileB = rowToProfile(rowB);

    // Fetch latest signal bundle for profile A
    const signalRow = await db
      .prepare("SELECT * FROM signal_bundles WHERE profile_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(profileAId)
      .first();

    const signalsA: WhatsAppSignals | null = signalRow
      ? JSON.parse(signalRow.signals_json as string)
      : null;

    // Parse scoring weights from env, fall back to defaults
    let weights: ScoringWeights = DEFAULT_WEIGHTS;
    if (cfEnv.SCORING_WEIGHTS) {
      try {
        weights = JSON.parse(cfEnv.SCORING_WEIGHTS) as ScoringWeights;
      } catch {
        // Invalid JSON in env var — use defaults
      }
    }

    // Run scoring
    const evaluated = scoreProfiles(profileA, profileB, signalsA, weights);
    const recommendation = buildRecommendation(evaluated.score, evaluated.concerns);
    const firstDateSuggestion = suggestFirstDate(profileA, profileB, evaluated.sharedInterests);

    const result = {
      profileA,
      profileB,
      compatibilityScore: evaluated.score,
      strengths: evaluated.strengths.length
        ? evaluated.strengths
        : ["Baseline conversational compatibility detected."],
      concerns: evaluated.concerns,
      rounds: [],
      firstDateSuggestion,
      closingAssessment: "Server-side scoring completed without agent simulation rounds.",
      recommendation,
    };

    // Store result in match_results table
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO match_results (id, profile_a_id, profile_b_id, compatibility_score, verdict, result_json)
         VALUES (?,?,?,?,?,?)`,
      )
      .bind(
        id,
        profileAId,
        profileBId,
        result.compatibilityScore,
        result.recommendation.verdict,
        JSON.stringify(result),
      )
      .run();

    return NextResponse.json({ ...result, matchResultId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
