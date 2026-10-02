import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { rowToDate, rowToMessage, rowToVerdict } from "@/lib/agentPlatform/dates";
import type { DateMessage, Verdict, VirtualDate } from "@/lib/agentPlatform/types";

export type PublicAgentSnapshot = {
  id: string;
  displayName: string;
  framework: string | null;
  personaName: string;
};

export type PublicDateRow = {
  date: VirtualDate;
  initiator: PublicAgentSnapshot;
  recipient: PublicAgentSnapshot;
  recentMessages: DateMessage[];
  myVerdict: null;
  verdicts: Verdict[];
  mutualMatch: boolean | null;
};

export type PublicActivityResponse = {
  generatedAt: string;
  totals: {
    agents: number;
    personas: number;
    activeDates: number;
    completedDates: number;
    mutualMatches: number;
  };
  pending: PublicDateRow[];
  active: PublicDateRow[];
  recentlyCompleted: PublicDateRow[];
};

const ACTIVE_LIMIT = 12;
const COMPLETED_LIMIT = 12;

export async function GET() {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;

  const [agentsCount, personasCount, activeCount, completedCount, mutualCount] = await Promise.all([
    db.prepare("SELECT COUNT(*) as c FROM agents WHERE status = 'active'").first<{ c: number }>(),
    db.prepare("SELECT COUNT(*) as c FROM profiles").first<{ c: number }>(),
    db.prepare("SELECT COUNT(*) as c FROM virtual_dates WHERE status = 'active'").first<{ c: number }>(),
    db.prepare("SELECT COUNT(*) as c FROM virtual_dates WHERE status = 'completed'").first<{ c: number }>(),
    db.prepare(
      `SELECT COUNT(*) as c FROM (
         SELECT date_id FROM verdicts WHERE would_meet_irl = 1
         GROUP BY date_id HAVING COUNT(*) >= 2
       )`,
    ).first<{ c: number }>(),
  ]);

  const { results: pendingRows } = await db
    .prepare(
      "SELECT * FROM virtual_dates WHERE status = 'pending' ORDER BY created_at DESC LIMIT 6",
    )
    .all<Record<string, unknown>>();
  const { results: activeRows } = await db
    .prepare(
      "SELECT * FROM virtual_dates WHERE status = 'active' ORDER BY started_at DESC, created_at DESC LIMIT ?",
    )
    .bind(ACTIVE_LIMIT)
    .all<Record<string, unknown>>();
  const { results: completedRows } = await db
    .prepare(
      "SELECT * FROM virtual_dates WHERE status IN ('completed','declined') ORDER BY completed_at DESC LIMIT ?",
    )
    .bind(COMPLETED_LIMIT)
    .all<Record<string, unknown>>();

  const pending = (pendingRows ?? []).map(rowToDate);
  const active = (activeRows ?? []).map(rowToDate);
  const completed = (completedRows ?? []).map(rowToDate);
  const allDates = [...pending, ...active, ...completed];

  // Bulk fetch all referenced agents + personas
  const agentIds = new Set<string>();
  for (const d of allDates) {
    agentIds.add(d.initiatorAgentId);
    agentIds.add(d.recipientAgentId);
  }

  const agentMap = new Map<string, { id: string; displayName: string; framework: string | null; personaId: string }>();
  if (agentIds.size > 0) {
    const ids = Array.from(agentIds);
    const placeholders = ids.map(() => "?").join(",");
    const { results: agentRows } = await db
      .prepare(
        `SELECT id, display_name, framework, persona_id FROM agents WHERE id IN (${placeholders})`,
      )
      .bind(...ids)
      .all<Record<string, unknown>>();
    for (const row of agentRows ?? []) {
      agentMap.set(row.id as string, {
        id: row.id as string,
        displayName: row.display_name as string,
        framework: (row.framework as string | null) ?? null,
        personaId: row.persona_id as string,
      });
    }
  }

  const personaIds = new Set<string>();
  for (const a of agentMap.values()) personaIds.add(a.personaId);
  const personaNames = new Map<string, string>();
  if (personaIds.size > 0) {
    const pids = Array.from(personaIds);
    const placeholders = pids.map(() => "?").join(",");
    const { results: personaRows } = await db
      .prepare(`SELECT id, name FROM profiles WHERE id IN (${placeholders})`)
      .bind(...pids)
      .all<Record<string, unknown>>();
    for (const row of personaRows ?? []) {
      personaNames.set(row.id as string, row.name as string);
    }
  }

  const buildSnapshot = (agentId: string): PublicAgentSnapshot => {
    const a = agentMap.get(agentId);
    if (!a) return { id: agentId, displayName: "(unknown)", framework: null, personaName: "?" };
    return {
      id: a.id,
      displayName: a.displayName,
      framework: a.framework,
      personaName: personaNames.get(a.personaId) ?? "?",
    };
  };

  // Pull recent messages for active dates, and verdicts for completed dates.
  const buildRow = async (d: VirtualDate, includeMessages: boolean, includeVerdicts: boolean): Promise<PublicDateRow> => {
    let recentMessages: DateMessage[] = [];
    if (includeMessages) {
      const { results: msgRows } = await db
        .prepare(
          "SELECT * FROM date_messages WHERE date_id = ? ORDER BY turn_number DESC LIMIT 4",
        )
        .bind(d.id)
        .all<Record<string, unknown>>();
      recentMessages = (msgRows ?? []).map(rowToMessage).reverse();
    }
    let verdicts: Verdict[] = [];
    let mutualMatch: boolean | null = null;
    if (includeVerdicts) {
      const { results: vRows } = await db
        .prepare("SELECT * FROM verdicts WHERE date_id = ?")
        .bind(d.id)
        .all<Record<string, unknown>>();
      verdicts = (vRows ?? []).map(rowToVerdict);
      mutualMatch = verdicts.length >= 2 && verdicts.every((v) => v.wouldMeetIrl);
    }
    return {
      date: d,
      initiator: buildSnapshot(d.initiatorAgentId),
      recipient: buildSnapshot(d.recipientAgentId),
      recentMessages,
      myVerdict: null,
      verdicts,
      mutualMatch,
    };
  };

  const pendingRowsOut = await Promise.all(pending.map((d: VirtualDate) => buildRow(d, false, false)));
  const activeRowsOut = await Promise.all(active.map((d: VirtualDate) => buildRow(d, true, false)));
  const completedRowsOut = await Promise.all(completed.map((d: VirtualDate) => buildRow(d, true, true)));

  const response: PublicActivityResponse = {
    generatedAt: new Date().toISOString(),
    totals: {
      agents: Number(agentsCount?.c ?? 0),
      personas: Number(personasCount?.c ?? 0),
      activeDates: Number(activeCount?.c ?? 0),
      completedDates: Number(completedCount?.c ?? 0),
      mutualMatches: Number(mutualCount?.c ?? 0),
    },
    pending: pendingRowsOut,
    active: activeRowsOut,
    recentlyCompleted: completedRowsOut,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
