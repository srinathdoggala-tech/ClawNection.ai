import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticateAgent } from "@/lib/agentPlatform/auth";
import { fetchProfile } from "@/lib/agentPlatform/persona";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/demo/run-date
//
// Hosted-agent kickoff: lets a freshly-onboarded user click one button and
// have us drive a real virtual date for them, end-to-end, using the
// platform's own Anthropic key. Their agent gets enrolled in the cron
// fleet so subsequent turns + verdicts are also handled server-side.
//
// One-shot: refuses if the user's agent already has any virtual date in
// flight or completed (they don't need a "demo" if they're already using
// the platform).
//
// Auth: bearer token = the user's freshly-issued API key.
//
// Returns: { dateId, recipient: { name, agentId }, watchUrl }

const MODEL = "claude-haiku-4-5-20251001";

type WorkerSelf = { fetch: (req: Request) => Promise<Response> };

type Persona = {
  id: string;
  name: string;
  age: number;
  bio?: string;
  location?: string;
  interests?: string[];
  values?: string[];
  dealbreakers?: string[];
  idealFirstDate?: string;
  preferenceAgeRange?: { min: number; max: number };
  preferenceNotes?: string;
  relationshipIntent?: string;
  lookingFor?: string;
  genderIdentity?: string;
  communicationStyle?: string;
  lifestyleHabits?: Record<string, string>;
};

async function claude(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 250,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = json.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new Error("anthropic: empty text");
  return text;
}

export async function POST(req: NextRequest): Promise<Response> {
  const { env } = getCloudflareContext();
  const cfEnv = env as unknown as {
    DB: D1Database;
    WORKER_SELF_REFERENCE?: WorkerSelf;
    ANTHROPIC_API_KEY?: string;
    CRON_HEARTBEAT_SECRET?: string;
  };
  const db = cfEnv.DB;

  const agent = await authenticateAgent(db, req);
  if (!agent) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const anthropicKey = cfEnv.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: "anthropic_api_key_not_set" },
      { status: 500 },
    );
  }
  const selfRef = cfEnv.WORKER_SELF_REFERENCE;
  if (!selfRef) {
    return NextResponse.json(
      { error: "worker_self_reference_missing" },
      { status: 500 },
    );
  }

  // Gate: if this agent already has any dates, no demo is needed.
  const existingDate = await db
    .prepare(
      "SELECT id FROM virtual_dates WHERE initiator_agent_id = ? OR recipient_agent_id = ? LIMIT 1",
    )
    .bind(agent.id, agent.id)
    .first<{ id: string }>();
  if (existingDate) {
    return NextResponse.json(
      {
        error: "already_active",
        message:
          "Your agent already has dates on the platform — head to /watch to see them.",
        existingDateId: existingDate.id,
      },
      { status: 409 },
    );
  }

  // Load my persona.
  const myPersona = await fetchProfile(db, agent.personaId);
  if (!myPersona) {
    return NextResponse.json({ error: "persona_missing" }, { status: 500 });
  }

  // Find a compatible test-bot. We want candidates whose lookingFor matches
  // my gender (i.e. they're interested in someone like me), within my
  // preference age range, restricted to active test-bot agents only —
  // keeps the demo population deterministic.
  const myGender = myPersona.genderIdentity;
  const desiredCounterpartLookingFor =
    myGender === "Male" ? "Men" : myGender === "Female" ? "Women" : null;
  const minAge = myPersona.preferenceAgeRange?.min ?? 18;
  const maxAge = myPersona.preferenceAgeRange?.max ?? 99;

  type CandidateRow = {
    persona_id: string;
    persona_name: string;
    persona_age: number;
    persona_location: string | null;
    persona_looking_for: string | null;
    persona_interests: string | null;
    agent_id: string;
    agent_display_name: string;
    agent_framework: string | null;
  };

  const sql = `
    SELECT p.id AS persona_id, p.name AS persona_name, p.age AS persona_age,
           p.location AS persona_location, p.looking_for AS persona_looking_for,
           p.interests AS persona_interests,
           a.id AS agent_id, a.display_name AS agent_display_name,
           a.framework AS agent_framework
    FROM agents a
    JOIN profiles p ON p.id = a.persona_id
    WHERE a.status = 'active'
      AND a.framework = 'test-bot'
      AND a.persona_id != ?
      AND p.age >= ? AND p.age <= ?
      ${desiredCounterpartLookingFor ? "AND p.looking_for = ?" : ""}
    ORDER BY a.last_seen_at DESC
    LIMIT 25
  `;
  const binds: unknown[] = [myPersona.id, minAge, maxAge];
  if (desiredCounterpartLookingFor) binds.push(desiredCounterpartLookingFor);

  const { results: candidateRows } = await db
    .prepare(sql)
    .bind(...binds)
    .all<CandidateRow>();
  if (!candidateRows || candidateRows.length === 0) {
    return NextResponse.json(
      {
        error: "no_compatible_candidates",
        message:
          "No compatible test agents matched your preferences. Try widening your age range or location.",
      },
      { status: 409 },
    );
  }

  // Score by shared interests, pick best.
  const myInterests = new Set(
    (myPersona.interests ?? []).map((s) => s.toLowerCase()),
  );
  const scored = candidateRows.map((c) => {
    let interests: string[] = [];
    try {
      const parsed = JSON.parse(c.persona_interests ?? "[]");
      if (Array.isArray(parsed)) interests = parsed;
    } catch {}
    const overlap = interests.filter((i) =>
      myInterests.has(i.toLowerCase()),
    ).length;
    return { row: c, interests, overlap };
  });
  scored.sort((a, b) => b.overlap - a.overlap || Math.random() - 0.5);
  const target = scored[0];

  // Compose opening message via Claude, in the user's persona voice.
  const counterpartPersona: Persona = {
    id: target.row.persona_id,
    name: target.row.persona_name,
    age: target.row.persona_age,
    location: target.row.persona_location ?? "",
    interests: target.interests,
  };
  let opening: string;
  try {
    opening = await claude(
      anthropicKey,
      `You are ${myPersona.name}'s dating agent on a virtual dating platform. Compose a 1–2 sentence opening message to ${counterpartPersona.name}. Reference one specific thing from their persona. Output the raw message only — no quotes, no "Name:" prefix.

YOUR HUMAN'S PERSONA:
${JSON.stringify(myPersona, null, 2)}

THEIR PERSONA:
${JSON.stringify(counterpartPersona, null, 2)}`,
      "Write the opening message now.",
      200,
    );
  } catch (err) {
    return NextResponse.json(
      { error: "opening_compose_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // POST the date as the user, via WORKER_SELF_REFERENCE so we route through
  // the platform's normal /api/dates handler (validation, duplicate check,
  // event tagging, etc.).
  const url = new URL(req.url);
  const baseOrigin = `${url.protocol}//${url.host}`;
  const apiKeyHeader = req.headers.get("authorization") ?? "";

  const initRes = await selfRef.fetch(
    new Request(`${baseOrigin}/api/dates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKeyHeader,
      },
      body: JSON.stringify({
        recipientAgentId: target.row.agent_id,
        openingMessage: opening,
        maxTurns: 4,
      }),
    }),
  );
  if (!initRes.ok) {
    const body = await initRes.text();
    return NextResponse.json(
      {
        error: "date_initiate_failed",
        message: `internal /api/dates → HTTP ${initRes.status}: ${body.slice(0, 200)}`,
      },
      { status: 502 },
    );
  }
  const initJson = (await initRes.json()) as { date: { id: string } };
  const dateId = initJson.date.id;

  // Enroll the user's agent in the cron-driven hosted fleet so future
  // turns + the user's verdict are handled server-side without further
  // user action. The token in the bearer header is the same one stored by
  // the user — we extract it from the auth header rather than the agent
  // record (which only has the hash). If anything's malformed we just skip
  // enrollment — the date can still play out via the demo button being
  // re-clicked later.
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(apiKeyHeader);
  const userApiKey = bearerMatch ? bearerMatch[1].trim() : null;
  if (userApiKey) {
    try {
      await db
        .prepare(
          "INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES (?, ?, 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1",
        )
        .bind(agent.id, userApiKey)
        .run();
    } catch {
      // non-fatal — date is still created, will progress via cron when the
      // counterpart's verdict triggers their inbox-sweep regardless.
    }
  }

  return NextResponse.json(
    {
      dateId,
      recipient: {
        agentId: target.row.agent_id,
        personaName: counterpartPersona.name,
        personaAge: counterpartPersona.age,
      },
      opening,
      watchUrl: `${baseOrigin}/dates/${dateId}?demo=1`,
      message:
        "Your demo date is starting. Both your agent and the recipient are now driven server-side; turns will arrive over the next 5–10 minutes via our scheduled heartbeat. Watch the conversation unfold at the watchUrl.",
    },
    { status: 201 },
  );
}
