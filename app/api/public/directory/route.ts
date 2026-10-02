import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type DirectoryEntry = {
  agentId: string;
  displayName: string;
  framework: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  persona: {
    id: string;
    name: string;
    age: number;
    location: string;
    relationshipIntent: string;
    lookingFor: string;
    communicationStyle: string;
    bio: string;
    interestsPreview: string[];
  };
  stats: {
    initiated: number;
    completed: number;
    mutualMatches: number;
  };
};

export type DirectoryResponse = {
  generatedAt: string;
  count: number;
  entries: DirectoryEntry[];
};

export async function GET() {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;

  const { results: agentRows } = await db
    .prepare(
      `SELECT a.id            AS agent_id,
              a.display_name  AS display_name,
              a.framework     AS framework,
              a.created_at    AS created_at,
              a.last_seen_at  AS last_seen_at,
              p.id                  AS persona_id,
              p.name                AS persona_name,
              p.age                 AS persona_age,
              p.location            AS persona_location,
              p.relationship_intent AS relationship_intent,
              p.looking_for         AS looking_for,
              p.communication_style AS communication_style,
              p.bio                 AS bio,
              p.interests           AS interests
       FROM agents a
       JOIN profiles p ON p.id = a.persona_id
       WHERE a.status = 'active'
       ORDER BY (CASE WHEN a.last_seen_at IS NULL THEN 0 ELSE 1 END) DESC, a.last_seen_at DESC, a.created_at DESC
       LIMIT 100`,
    )
    .all<Record<string, unknown>>();

  const agents = agentRows ?? [];
  const agentIds = agents.map((r) => r.agent_id as string);

  // Bulk fetch stats — initiated, completed, mutual matches per agent.
  const initiated = new Map<string, number>();
  const completed = new Map<string, number>();
  const mutual = new Map<string, number>();

  // Stat queries are intentionally unbounded (no IN clause) and we filter in
  // JS — avoids D1's bound-parameter ceiling, and the row counts are small
  // enough that the cost is negligible.
  if (agentIds.length > 0) {
    const agentIdSet = new Set(agentIds);

    const { results: initRows } = await db
      .prepare(
        `SELECT initiator_agent_id AS agent_id, COUNT(*) AS c
         FROM virtual_dates
         GROUP BY initiator_agent_id`,
      )
      .all<{ agent_id: string; c: number }>();
    for (const r of initRows ?? []) {
      if (agentIdSet.has(r.agent_id)) initiated.set(r.agent_id, Number(r.c));
    }

    const { results: completedRows } = await db
      .prepare(
        `SELECT agent_id, COUNT(*) AS c FROM (
           SELECT initiator_agent_id AS agent_id FROM virtual_dates WHERE status = 'completed'
           UNION ALL
           SELECT recipient_agent_id AS agent_id FROM virtual_dates WHERE status = 'completed'
         )
         GROUP BY agent_id`,
      )
      .all<{ agent_id: string; c: number }>();
    for (const r of completedRows ?? []) {
      if (agentIdSet.has(r.agent_id)) completed.set(r.agent_id, Number(r.c));
    }

    const { results: mutualRows } = await db
      .prepare(
        `SELECT agent_id, COUNT(*) AS c FROM (
           SELECT vd.initiator_agent_id AS agent_id
           FROM virtual_dates vd
           WHERE vd.status = 'completed'
             AND (SELECT COUNT(*) FROM verdicts v WHERE v.date_id = vd.id AND v.would_meet_irl = 1) >= 2
           UNION ALL
           SELECT vd.recipient_agent_id AS agent_id
           FROM virtual_dates vd
           WHERE vd.status = 'completed'
             AND (SELECT COUNT(*) FROM verdicts v WHERE v.date_id = vd.id AND v.would_meet_irl = 1) >= 2
         )
         GROUP BY agent_id`,
      )
      .all<{ agent_id: string; c: number }>();
    for (const r of mutualRows ?? []) {
      if (agentIdSet.has(r.agent_id)) mutual.set(r.agent_id, Number(r.c));
    }
  }

  const entries: DirectoryEntry[] = agents.map((row) => {
    const id = row.agent_id as string;
    let interestsPreview: string[] = [];
    try {
      const parsed = JSON.parse((row.interests as string) || "[]");
      if (Array.isArray(parsed)) interestsPreview = parsed.slice(0, 4);
    } catch {}
    return {
      agentId: id,
      displayName: row.display_name as string,
      framework: (row.framework as string | null) ?? null,
      createdAt: row.created_at as string,
      lastSeenAt: (row.last_seen_at as string | null) ?? null,
      persona: {
        id: row.persona_id as string,
        name: row.persona_name as string,
        age: Number(row.persona_age ?? 0),
        location: (row.persona_location as string | null) ?? "",
        relationshipIntent: (row.relationship_intent as string | null) ?? "",
        lookingFor: (row.looking_for as string | null) ?? "",
        communicationStyle: (row.communication_style as string | null) ?? "",
        bio: (row.bio as string | null) ?? "",
        interestsPreview,
      },
      stats: {
        initiated: initiated.get(id) ?? 0,
        completed: completed.get(id) ?? 0,
        mutualMatches: mutual.get(id) ?? 0,
      },
    };
  });

  const response: DirectoryResponse = {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
