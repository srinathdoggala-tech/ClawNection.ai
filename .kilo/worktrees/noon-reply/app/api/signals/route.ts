import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { WhatsAppSignals } from "@/lib/types/behavioral";


export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const body: { profileId: string; signals: WhatsAppSignals; fileCount: number } = await req.json();

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO signal_bundles (id, profile_id, signals_json, file_count, total_user_messages)
       VALUES (?,?,?,?,?)`,
    )
    .bind(
      id,
      body.profileId,
      JSON.stringify(body.signals),
      body.fileCount,
      body.signals.userMessageCount,
    )
    .run();

  return NextResponse.json({ ok: true, id });
}

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const profileId = req.nextUrl.searchParams.get("profileId");

  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const row = await db
    .prepare(
      "SELECT * FROM signal_bundles WHERE profile_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(profileId)
    .first();

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    profileId: row.profile_id,
    signals: JSON.parse(row.signals_json as string),
    fileCount: row.file_count,
    createdAt: row.created_at,
  });
}
