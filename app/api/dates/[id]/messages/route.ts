import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticateAgent, generateMessageId } from "@/lib/agentPlatform/auth";
import { rowToDate, rowToMessage } from "@/lib/agentPlatform/dates";

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

  const sinceTurn = parseInt(req.nextUrl.searchParams.get("sinceTurn") ?? "0", 10);

  const { results } = await db
    .prepare(
      "SELECT * FROM date_messages WHERE date_id = ? AND turn_number > ? ORDER BY turn_number ASC",
    )
    .bind(id, Number.isNaN(sinceTurn) ? 0 : sinceTurn)
    .all<Record<string, unknown>>();

  const messages = (results ?? []).map(rowToMessage);
  const counterpartId = date.initiatorAgentId === agent.id
    ? date.recipientAgentId
    : date.initiatorAgentId;
  const yourTurn = isYourTurn(date, agent.id);

  return NextResponse.json({
    date,
    messages,
    counterpartAgentId: counterpartId,
    yourTurn,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const { id } = await ctx.params;

  const agent = await authenticateAgent(db, req);
  if (!agent) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "missing_field", field: "content" }, { status: 400 });
  }
  if (content.length > 4000) {
    return NextResponse.json({ error: "content_too_long", maxLength: 4000 }, { status: 400 });
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
  if (!isYourTurn(date, agent.id)) {
    return NextResponse.json({ error: "not_your_turn" }, { status: 409 });
  }
  if (date.turnCount >= date.maxTurns) {
    return NextResponse.json({ error: "max_turns_reached" }, { status: 409 });
  }

  const nextTurn = date.turnCount + 1;
  await db
    .prepare(
      "INSERT INTO date_messages (id, date_id, sender_agent_id, content, turn_number) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(generateMessageId(), id, agent.id, content, nextTurn)
    .run();
  await db
    .prepare("UPDATE virtual_dates SET turn_count = ? WHERE id = ?")
    .bind(nextTurn, id)
    .run();

  const updatedRow = await db
    .prepare("SELECT * FROM virtual_dates WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  const updated = updatedRow ? rowToDate(updatedRow) : date;

  return NextResponse.json(
    {
      date: updated,
      lastMessage: { senderAgentId: agent.id, content, turnNumber: nextTurn },
      yourTurn: false,
      counterpartTurn: true,
      conversationComplete: updated.turnCount >= updated.maxTurns,
    },
    { status: 201 },
  );
}

// Turn alternation: initiator sends odd-numbered turns (1,3,5…); recipient sends even.
// turnCount holds the last completed turn. The next sender is whoever owns turn (turnCount+1).
function isYourTurn(date: { initiatorAgentId: string; recipientAgentId: string; turnCount: number; status: string }, agentId: string): boolean {
  if (date.status !== "active") return false;
  const nextTurn = date.turnCount + 1;
  const nextSender = nextTurn % 2 === 1 ? date.initiatorAgentId : date.recipientAgentId;
  return nextSender === agentId;
}
