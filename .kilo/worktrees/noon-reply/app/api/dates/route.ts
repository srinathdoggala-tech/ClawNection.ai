import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticateAgent, generateDateId } from "@/lib/agentPlatform/auth";
import { fetchProfile } from "@/lib/agentPlatform/persona";
import { rowToDate } from "@/lib/agentPlatform/dates";
import { rowToAgent } from "@/lib/agentPlatform/auth";

const DEFAULT_MAX_TURNS = 10;

export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;

  const agent = await authenticateAgent(db, req);
  if (!agent) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: {
    recipientAgentId?: string;
    openingMessage?: string;
    maxTurns?: number;
    experimentCohort?: string;
    subjectModel?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.recipientAgentId) {
    return NextResponse.json(
      { error: "missing_field", field: "recipientAgentId" },
      { status: 400 },
    );
  }
  if (body.recipientAgentId === agent.id) {
    return NextResponse.json(
      { error: "cannot_date_self" },
      { status: 400 },
    );
  }

  const recipientRow = await db
    .prepare(
      "SELECT id, persona_id, display_name, operator, framework, status, created_at, last_seen_at FROM agents WHERE id = ?",
    )
    .bind(body.recipientAgentId)
    .first<Record<string, unknown>>();

  if (!recipientRow) {
    return NextResponse.json({ error: "recipient_not_found" }, { status: 404 });
  }
  if ((recipientRow.status as string) !== "active") {
    return NextResponse.json({ error: "recipient_inactive" }, { status: 409 });
  }

  // Prevent duplicate active or pending dates between the same pair.
  const existing = await db
    .prepare(
      `SELECT id FROM virtual_dates
       WHERE status IN ('pending', 'active')
         AND ((initiator_agent_id = ? AND recipient_agent_id = ?)
              OR (initiator_agent_id = ? AND recipient_agent_id = ?))
       LIMIT 1`,
    )
    .bind(agent.id, body.recipientAgentId, body.recipientAgentId, agent.id)
    .first<{ id: string }>();
  if (existing) {
    return NextResponse.json(
      { error: "date_already_in_progress", dateId: existing.id },
      { status: 409 },
    );
  }

  const dateId = generateDateId();
  const maxTurns = clampTurns(body.maxTurns);
  const opening = body.openingMessage?.trim() || null;

  await db
    .prepare(
      `INSERT INTO virtual_dates
       (id, initiator_agent_id, recipient_agent_id, status, opening_message,
        turn_count, max_turns, experiment_cohort, subject_model)
       VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?)`,
    )
    .bind(
      dateId,
      agent.id,
      body.recipientAgentId,
      opening,
      maxTurns,
      body.experimentCohort?.trim() || null,
      body.subjectModel?.trim() || null,
    )
    .run();

  const row = await db
    .prepare("SELECT * FROM virtual_dates WHERE id = ?")
    .bind(dateId)
    .first<Record<string, unknown>>();

  const date = row ? rowToDate(row) : null;
  const recipientAgent = rowToAgent(recipientRow);
  const recipientPersona = await fetchProfile(db, recipientAgent.personaId);

  return NextResponse.json(
    {
      date,
      recipientAgent,
      recipientPersona,
    },
    { status: 201 },
  );
}

// Accept invite. Body: { action: "accept" | "decline" }
// Path-style at /api/dates/:id/respond
function clampTurns(v: number | undefined): number {
  if (!v || Number.isNaN(v)) return DEFAULT_MAX_TURNS;
  return Math.min(Math.max(Math.floor(v), 2), 30);
}
