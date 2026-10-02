import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { MatchResult } from "@/lib/types/matching";


export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const result: MatchResult & { profileAId: string; profileBId: string } = await req.json();

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO match_results (id, profile_a_id, profile_b_id, compatibility_score, verdict, result_json)
       VALUES (?,?,?,?,?,?)`,
    )
    .bind(
      id,
      result.profileAId ?? result.profileA.id,
      result.profileBId ?? result.profileB.id,
      result.compatibilityScore,
      result.recommendation.verdict,
      JSON.stringify(result),
    )
    .run();

  return NextResponse.json({ ok: true, id });
}

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const profileId = req.nextUrl.searchParams.get("profileId");

  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const rows = await db
    .prepare(
      `SELECT id, profile_b_id, compatibility_score, verdict, created_at
       FROM match_results WHERE profile_a_id = ? ORDER BY created_at DESC LIMIT 20`,
    )
    .bind(profileId)
    .all();

  return NextResponse.json({ results: rows.results });
}
