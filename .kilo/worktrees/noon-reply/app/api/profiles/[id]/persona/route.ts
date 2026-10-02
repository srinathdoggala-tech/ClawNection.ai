import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { VoicePersona } from "@/lib/types/persona";


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const { id } = await params;

  const row = await db
    .prepare("SELECT * FROM voice_personas WHERE profile_id = ?")
    .bind(id)
    .first();

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const persona: VoicePersona = {
    profile_id: row.profile_id as string,
    vapi_call_id: (row.vapi_call_id as string | null) ?? null,
    portrait: row.portrait as string,
    structured_signals: row.structured_signals as string,
    voice_samples: row.voice_samples as string,
    transcript: (row.transcript as string | null) ?? null,
    recording_url: (row.recording_url as string | null) ?? null,
    call_duration_seconds: (row.call_duration_seconds as number | null) ?? null,
    ended_reason: (row.ended_reason as string | null) ?? null,
    analysis_skipped: row.analysis_skipped === 1,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };

  return NextResponse.json(persona);
}
