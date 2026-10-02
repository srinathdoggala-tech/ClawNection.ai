import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { SelfAwarenessGap } from "@/lib/types/behavioral";


// Internal-only: gap data is never surfaced in UI
export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const body: { profileId: string; gap: SelfAwarenessGap } = await req.json();

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT OR REPLACE INTO self_awareness_gaps (id, profile_id, gap_json)
       VALUES (?,?,?)`,
    )
    .bind(id, body.profileId, JSON.stringify(body.gap))
    .run();

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const profileId = req.nextUrl.searchParams.get("profileId");

  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const row = await db
    .prepare("SELECT * FROM self_awareness_gaps WHERE profile_id = ?")
    .bind(profileId)
    .first();

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ gap: JSON.parse(row.gap_json as string) });
}
