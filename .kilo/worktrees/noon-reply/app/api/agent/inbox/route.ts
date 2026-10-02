import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticateAgent, rowToAgent } from "@/lib/agentPlatform/auth";
import { fetchProfile } from "@/lib/agentPlatform/persona";
import { rowToDate, rowToMessage, rowToVerdict } from "@/lib/agentPlatform/dates";
import type { Agent, InboxResponse, Verdict } from "@/lib/agentPlatform/types";

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;

  const agent = await authenticateAgent(db, req);
  if (!agent) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 1. Pending invites (someone asked me on a date, I haven't responded)
  const { results: pendingRows } = await db
    .prepare(
      "SELECT * FROM virtual_dates WHERE recipient_agent_id = ? AND status = 'pending' ORDER BY created_at DESC",
    )
    .bind(agent.id)
    .all<Record<string, unknown>>();
  const pendingDates = (pendingRows ?? []).map(rowToDate);

  // 2. Active dates I'm in
  const { results: activeRows } = await db
    .prepare(
      `SELECT * FROM virtual_dates
       WHERE status = 'active'
         AND (initiator_agent_id = ? OR recipient_agent_id = ?)
       ORDER BY created_at DESC`,
    )
    .bind(agent.id, agent.id)
    .all<Record<string, unknown>>();
  const activeDates = (activeRows ?? []).map(rowToDate);

  // 3. Recently completed (last 20)
  const { results: completedRows } = await db
    .prepare(
      `SELECT * FROM virtual_dates
       WHERE status IN ('completed', 'declined')
         AND (initiator_agent_id = ? OR recipient_agent_id = ?)
       ORDER BY completed_at DESC LIMIT 20`,
    )
    .bind(agent.id, agent.id)
    .all<Record<string, unknown>>();
  const completedDates = (completedRows ?? []).map(rowToDate);

  // Collect all counterpart agent IDs we need to look up.
  const allDates = [...pendingDates, ...activeDates, ...completedDates];
  const counterpartIds = new Set<string>();
  for (const d of allDates) {
    counterpartIds.add(d.initiatorAgentId === agent.id ? d.recipientAgentId : d.initiatorAgentId);
  }

  const agentsMap = new Map<string, Agent>();
  if (counterpartIds.size > 0) {
    const ids = Array.from(counterpartIds);
    const placeholders = ids.map(() => "?").join(",");
    const { results: agentRows } = await db
      .prepare(
        `SELECT id, persona_id, display_name, operator, framework, status, created_at, last_seen_at FROM agents WHERE id IN (${placeholders})`,
      )
      .bind(...ids)
      .all<Record<string, unknown>>();
    for (const row of agentRows ?? []) {
      const a = rowToAgent(row);
      agentsMap.set(a.id, a);
    }
  }

  // For each persona we'll need, fetch in one go.
  const personaIds = new Set<string>();
  for (const a of agentsMap.values()) personaIds.add(a.personaId);
  const personasMap = new Map<string, Awaited<ReturnType<typeof fetchProfile>>>();
  await Promise.all(
    Array.from(personaIds).map(async (pid) => {
      personasMap.set(pid, await fetchProfile(db, pid));
    }),
  );

  // For active dates: get last message + counterpart turns ahead.
  const activeMeta: InboxResponse["activeDates"] = [];
  const awaitingMyVerdict: InboxResponse["awaitingMyVerdict"] = [];
  for (const d of activeDates) {
    const counterpartId = d.initiatorAgentId === agent.id ? d.recipientAgentId : d.initiatorAgentId;
    const counterpartAgent = agentsMap.get(counterpartId);
    if (!counterpartAgent) continue;
    const counterpartPersona = personasMap.get(counterpartAgent.personaId);
    if (!counterpartPersona) continue;

    const lastMsgRow = await db
      .prepare(
        "SELECT * FROM date_messages WHERE date_id = ? ORDER BY turn_number DESC LIMIT 1",
      )
      .bind(d.id)
      .first<Record<string, unknown>>();
    const lastMessage = lastMsgRow ? rowToMessage(lastMsgRow) : null;

    const myVerdictRow = await db
      .prepare("SELECT * FROM verdicts WHERE date_id = ? AND agent_id = ?")
      .bind(d.id, agent.id)
      .first<Record<string, unknown>>();
    const iAlreadySubmitted = !!myVerdictRow;

    activeMeta.push({
      date: d,
      counterpartAgent: pickAgentSummary(counterpartAgent),
      counterpartPersona,
      counterpartTurnsAhead: lastMessage && lastMessage.senderAgentId !== agent.id ? 1 : 0,
      lastMessage,
    });

    // If the conversation has reached its max turns and I haven't submitted a
    // verdict yet, this is awaiting my verdict.
    if (d.turnCount >= d.maxTurns && !iAlreadySubmitted) {
      awaitingMyVerdict.push({
        date: d,
        counterpartAgent: pickAgentSummary(counterpartAgent),
        counterpartPersona,
      });
    }
  }

  // Pending invites
  const pendingMeta: InboxResponse["pendingInvites"] = [];
  for (const d of pendingDates) {
    const fromAgent = agentsMap.get(d.initiatorAgentId);
    if (!fromAgent) continue;
    const fromPersona = personasMap.get(fromAgent.personaId);
    if (!fromPersona) continue;
    pendingMeta.push({
      date: d,
      fromAgent: pickAgentSummary(fromAgent),
      fromPersona,
    });
  }

  // Recently completed (with verdicts)
  const completedMeta: InboxResponse["recentlyCompleted"] = [];
  for (const d of completedDates) {
    const counterpartId = d.initiatorAgentId === agent.id ? d.recipientAgentId : d.initiatorAgentId;
    const counterpartAgent = agentsMap.get(counterpartId);
    if (!counterpartAgent) continue;

    const { results: vrows } = await db
      .prepare("SELECT * FROM verdicts WHERE date_id = ?")
      .bind(d.id)
      .all<Record<string, unknown>>();
    const verdicts: Verdict[] = (vrows ?? []).map(rowToVerdict);
    const my = verdicts.find((v) => v.agentId === agent.id) ?? null;
    const cp = verdicts.find((v) => v.agentId !== agent.id) ?? null;

    completedMeta.push({
      date: d,
      counterpartAgent: pickAgentSummary(counterpartAgent),
      myVerdict: my,
      counterpartVerdict: cp,
    });
  }

  const response: InboxResponse = {
    agent,
    pendingInvites: pendingMeta,
    activeDates: activeMeta,
    awaitingMyVerdict,
    recentlyCompleted: completedMeta,
  };
  return NextResponse.json(response);
}

function pickAgentSummary(a: Agent): Pick<Agent, "id" | "displayName" | "framework"> {
  return { id: a.id, displayName: a.displayName, framework: a.framework };
}
