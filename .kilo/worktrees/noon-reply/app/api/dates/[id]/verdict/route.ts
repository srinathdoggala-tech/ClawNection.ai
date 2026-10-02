import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticateAgent, generateVerdictId } from "@/lib/agentPlatform/auth";
import { rowToDate, rowToVerdict } from "@/lib/agentPlatform/dates";
import type { Verdict } from "@/lib/agentPlatform/types";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const { id } = await ctx.params;

  const agent = await authenticateAgent(db, req);
  if (!agent) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { wouldMeetIrl?: boolean; rating?: number; reasoning?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.wouldMeetIrl !== "boolean") {
    return NextResponse.json(
      { error: "missing_field", field: "wouldMeetIrl", expected: "boolean" },
      { status: 400 },
    );
  }
  const rating = body.rating;
  if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 10)) {
    return NextResponse.json(
      { error: "invalid_rating", expected: "number 1..10" },
      { status: 400 },
    );
  }

  const dateRow = await db
    .prepare("SELECT * FROM virtual_dates WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!dateRow) {
    return NextResponse.json({ error: "date_not_found" }, { status: 404 });
  }

  const date = rowToDate(dateRow);
  if (date.initiatorAgentId !== agent.id && date.recipientAgentId !== agent.id) {
    return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
  }
  if (date.status !== "active") {
    return NextResponse.json(
      { error: "date_not_active", currentStatus: date.status },
      { status: 409 },
    );
  }

  // Upsert verdict (one per agent per date).
  const existing = await db
    .prepare("SELECT id FROM verdicts WHERE date_id = ? AND agent_id = ?")
    .bind(id, agent.id)
    .first<{ id: string }>();
  if (existing) {
    return NextResponse.json(
      { error: "verdict_already_submitted", verdictId: existing.id },
      { status: 409 },
    );
  }

  const verdictId = generateVerdictId();
  await db
    .prepare(
      "INSERT INTO verdicts (id, date_id, agent_id, would_meet_irl, rating, reasoning) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      verdictId,
      id,
      agent.id,
      body.wouldMeetIrl ? 1 : 0,
      rating ?? null,
      body.reasoning ?? null,
    )
    .run();

  // Check if both verdicts are now in. If so, mark the date completed.
  const { results: verdictRows } = await db
    .prepare("SELECT * FROM verdicts WHERE date_id = ?")
    .bind(id)
    .all<Record<string, unknown>>();
  const verdicts: Verdict[] = (verdictRows ?? []).map(rowToVerdict);
  const bothSubmitted = verdicts.length >= 2;

  if (bothSubmitted) {
    await db
      .prepare(
        "UPDATE virtual_dates SET status = 'completed', completed_at = datetime('now') WHERE id = ? AND status = 'active'",
      )
      .bind(id)
      .run();
  }

  const myVerdict = verdicts.find((v: Verdict) => v.agentId === agent.id) ?? null;
  const counterpartVerdict = verdicts.find((v: Verdict) => v.agentId !== agent.id) ?? null;
  const mutualMatch = bothSubmitted &&
    verdicts.every((v: Verdict) => v.wouldMeetIrl);

  const updatedRow = await db
    .prepare("SELECT * FROM virtual_dates WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();

  return NextResponse.json(
    {
      date: updatedRow ? rowToDate(updatedRow) : date,
      myVerdict,
      counterpartVerdict,
      bothSubmitted,
      mutualMatch,
    },
    { status: 201 },
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const { id } = await ctx.params;

  const agent = await authenticateAgent(db, req);
  if (!agent) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const dateRow = await db
    .prepare("SELECT * FROM virtual_dates WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!dateRow) {
    return NextResponse.json({ error: "date_not_found" }, { status: 404 });
  }
  const date = rowToDate(dateRow);
  if (date.initiatorAgentId !== agent.id && date.recipientAgentId !== agent.id) {
    return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
  }

  const { results } = await db
    .prepare("SELECT * FROM verdicts WHERE date_id = ?")
    .bind(id)
    .all<Record<string, unknown>>();
  const verdicts: Verdict[] = (results ?? []).map(rowToVerdict);
  const myVerdict = verdicts.find((v: Verdict) => v.agentId === agent.id) ?? null;
  const counterpartVerdict = verdicts.find((v: Verdict) => v.agentId !== agent.id) ?? null;
  const mutualMatch = verdicts.length >= 2 && verdicts.every((v: Verdict) => v.wouldMeetIrl);

  return NextResponse.json({ date, myVerdict, counterpartVerdict, mutualMatch });
}
