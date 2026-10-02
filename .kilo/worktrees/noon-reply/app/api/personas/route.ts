import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticateAgent } from "@/lib/agentPlatform/auth";
import { rowToProfile } from "@/lib/agentPlatform/persona";
import type { RomanticProfile } from "@/lib/types/matching";

const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;

  const agent = await authenticateAgent(db, req);
  if (!agent) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = req.nextUrl;
  const limit = clamp(parseInt(url.searchParams.get("limit") ?? "20", 10), 1, MAX_LIMIT);
  const minAge = optionalInt(url.searchParams.get("minAge"));
  const maxAge = optionalInt(url.searchParams.get("maxAge"));
  const location = url.searchParams.get("location");
  const intent = url.searchParams.get("intent");
  const lookingFor = url.searchParams.get("lookingFor");
  const excludeSelf = url.searchParams.get("excludeSelf") !== "false";

  const where: string[] = [];
  const params: unknown[] = [];

  if (excludeSelf) {
    where.push("id != ?");
    params.push(agent.personaId);
  }
  if (minAge !== undefined) {
    where.push("age >= ?");
    params.push(minAge);
  }
  if (maxAge !== undefined) {
    where.push("age <= ?");
    params.push(maxAge);
  }
  if (location) {
    where.push("LOWER(location) LIKE ?");
    params.push(`%${location.toLowerCase()}%`);
  }
  if (intent) {
    where.push("relationship_intent = ?");
    params.push(intent);
  }
  if (lookingFor) {
    where.push("(looking_for = ? OR looking_for = 'any')");
    params.push(lookingFor);
  }

  const sql = `SELECT * FROM profiles ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<Record<string, unknown>>();

  const personas: RomanticProfile[] = (results ?? []).map(rowToProfile);

  // Also return for each persona the agent IDs that represent it (so callers
  // can initiate a date without a separate lookup).
  const personaIds = personas.map((p: RomanticProfile) => p.id);
  const agentMap: Record<string, Array<{ id: string; displayName: string; framework: string | null }>> = {};
  if (personaIds.length > 0) {
    const placeholders = personaIds.map(() => "?").join(",");
    const { results: agentRows } = await db
      .prepare(
        `SELECT id, persona_id, display_name, framework FROM agents WHERE status = 'active' AND persona_id IN (${placeholders})`,
      )
      .bind(...personaIds)
      .all<Record<string, unknown>>();
    for (const row of agentRows ?? []) {
      const pid = row.persona_id as string;
      if (!agentMap[pid]) agentMap[pid] = [];
      agentMap[pid].push({
        id: row.id as string,
        displayName: row.display_name as string,
        framework: (row.framework as string | null) ?? null,
      });
    }
  }

  const candidates = personas.map((persona: RomanticProfile) => ({
    persona,
    agents: agentMap[persona.id] ?? [],
  }));

  return NextResponse.json({ count: candidates.length, candidates });
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(Math.max(n, lo), hi);
}
function optionalInt(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}
