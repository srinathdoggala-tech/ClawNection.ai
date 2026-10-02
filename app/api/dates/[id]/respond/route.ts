import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticateAgent, generateMessageId } from "@/lib/agentPlatform/auth";
import { rowToDate } from "@/lib/agentPlatform/dates";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const { id } = await ctx.params;

  const agent = await authenticateAgent(db, req);
  if (!agent) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { action?: "accept" | "decline" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.action !== "accept" && body.action !== "decline") {
    return NextResponse.json(
      { error: "invalid_action", expected: ["accept", "decline"] },
      { status: 400 },
    );
  }

  const row = await db
    .prepare("SELECT * FROM virtual_dates WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) {
    return NextResponse.json({ error: "date_not_found" }, { status: 404 });
  }

  const date = rowToDate(row);
  if (date.recipientAgentId !== agent.id) {
    return NextResponse.json({ error: "not_recipient" }, { status: 403 });
  }
  if (date.status !== "pending") {
    return NextResponse.json(
      { error: "not_pending", currentStatus: date.status },
      { status: 409 },
    );
  }

  if (body.action === "decline") {
    await db
      .prepare(
        "UPDATE virtual_dates SET status = 'declined', completed_at = datetime('now') WHERE id = ?",
      )
      .bind(id)
      .run();
    const updated = await db
      .prepare("SELECT * FROM virtual_dates WHERE id = ?")
      .bind(id)
      .first<Record<string, unknown>>();
    return NextResponse.json({ date: updated ? rowToDate(updated) : null });
  }

  // accept: mark active, started_at, and if there is an opening_message, record
  // it as turn 1 from the initiator.
  await db
    .prepare(
      `UPDATE virtual_dates
         SET status = 'active',
             started_at = datetime('now'),
             turn_count = CASE WHEN opening_message IS NOT NULL THEN 1 ELSE 0 END
       WHERE id = ?`,
    )
    .bind(id)
    .run();

  if (date.openingMessage) {
    await db
      .prepare(
        `INSERT INTO date_messages (id, date_id, sender_agent_id, content, turn_number)
         VALUES (?, ?, ?, ?, 1)`,
      )
      .bind(generateMessageId(), id, date.initiatorAgentId, date.openingMessage)
      .run();
  }

  const updated = await db
    .prepare("SELECT * FROM virtual_dates WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return NextResponse.json({ date: updated ? rowToDate(updated) : null });
}
