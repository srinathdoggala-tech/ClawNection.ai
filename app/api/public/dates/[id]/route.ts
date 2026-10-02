import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { rowToDate, rowToMessage, rowToVerdict } from "@/lib/agentPlatform/dates";
import { rowToProfile } from "@/lib/agentPlatform/persona";
import type {
  DateMessage,
  Verdict,
  VirtualDate,
} from "@/lib/agentPlatform/types";
import type { RomanticProfile } from "@/lib/types/matching";

export type PublicAgentLite = {
  id: string;
  displayName: string;
  framework: string | null;
  lastSeenAt: string | null;
  role: "initiator" | "recipient";
  persona: RomanticProfile;
};

export type PublicDateDetailResponse = {
  generatedAt: string;
  date: VirtualDate;
  initiator: PublicAgentLite;
  recipient: PublicAgentLite;
  messages: DateMessage[];
  verdicts: {
    initiator: Verdict | null;
    recipient: Verdict | null;
  };
  mutualMatch: boolean | null;
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const { id } = await ctx.params;

  const dateRow = await db
    .prepare("SELECT * FROM virtual_dates WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!dateRow) {
    return NextResponse.json({ error: "date_not_found" }, { status: 404 });
  }
  const date = rowToDate(dateRow);

  // Pull both agents in one query.
  const { results: agentRows } = await db
    .prepare(
      `SELECT id, display_name, framework, last_seen_at, persona_id
       FROM agents
       WHERE id IN (?, ?)`,
    )
    .bind(date.initiatorAgentId, date.recipientAgentId)
    .all<Record<string, unknown>>();

  const agentMap = new Map<string, Record<string, unknown>>();
  for (const row of agentRows ?? []) agentMap.set(row.id as string, row);

  const initiatorAgentRow = agentMap.get(date.initiatorAgentId);
  const recipientAgentRow = agentMap.get(date.recipientAgentId);
  if (!initiatorAgentRow || !recipientAgentRow) {
    return NextResponse.json({ error: "agent_missing" }, { status: 500 });
  }

  // Pull both personas.
  const personaIds = [
    initiatorAgentRow.persona_id as string,
    recipientAgentRow.persona_id as string,
  ];
  const { results: personaRows } = await db
    .prepare(`SELECT * FROM profiles WHERE id IN (?, ?)`)
    .bind(...personaIds)
    .all<Record<string, unknown>>();
  const personaMap = new Map<string, RomanticProfile>();
  for (const row of personaRows ?? []) {
    const p = rowToProfile(row);
    personaMap.set(p.id, p);
  }

  const initiatorPersona = personaMap.get(initiatorAgentRow.persona_id as string);
  const recipientPersona = personaMap.get(recipientAgentRow.persona_id as string);
  if (!initiatorPersona || !recipientPersona) {
    return NextResponse.json({ error: "persona_missing" }, { status: 500 });
  }

  // All messages, ordered by turn.
  const { results: messageRows } = await db
    .prepare(
      "SELECT * FROM date_messages WHERE date_id = ? ORDER BY turn_number ASC",
    )
    .bind(id)
    .all<Record<string, unknown>>();
  const messages: DateMessage[] = (messageRows ?? []).map(rowToMessage);

  // Verdicts (zero, one, or two).
  const { results: verdictRows } = await db
    .prepare("SELECT * FROM verdicts WHERE date_id = ?")
    .bind(id)
    .all<Record<string, unknown>>();
  const verdicts: Verdict[] = (verdictRows ?? []).map(rowToVerdict);
  const initiatorVerdict =
    verdicts.find((v) => v.agentId === date.initiatorAgentId) ?? null;
  const recipientVerdict =
    verdicts.find((v) => v.agentId === date.recipientAgentId) ?? null;

  const mutualMatch =
    initiatorVerdict && recipientVerdict
      ? initiatorVerdict.wouldMeetIrl && recipientVerdict.wouldMeetIrl
      : null;

  const response: PublicDateDetailResponse = {
    generatedAt: new Date().toISOString(),
    date,
    initiator: {
      id: date.initiatorAgentId,
      displayName: initiatorAgentRow.display_name as string,
      framework: (initiatorAgentRow.framework as string | null) ?? null,
      lastSeenAt: (initiatorAgentRow.last_seen_at as string | null) ?? null,
      role: "initiator",
      persona: initiatorPersona,
    },
    recipient: {
      id: date.recipientAgentId,
      displayName: recipientAgentRow.display_name as string,
      framework: (recipientAgentRow.framework as string | null) ?? null,
      lastSeenAt: (recipientAgentRow.last_seen_at as string | null) ?? null,
      role: "recipient",
      persona: recipientPersona,
    },
    messages,
    verdicts: {
      initiator: initiatorVerdict,
      recipient: recipientVerdict,
    },
    mutualMatch,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
