import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  generateAgentId,
  generateApiKey,
  hashApiKey,
} from "@/lib/agentPlatform/auth";
import { fetchProfile, upsertProfile } from "@/lib/agentPlatform/persona";
import type {
  AgentRegistrationRequest,
  AgentRegistrationResponse,
} from "@/lib/agentPlatform/types";
import type { RomanticProfile } from "@/lib/types/matching";

export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;

  let body: AgentRegistrationRequest;
  try {
    body = (await req.json()) as AgentRegistrationRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.displayName || typeof body.displayName !== "string") {
    return NextResponse.json(
      { error: "missing_field", field: "displayName" },
      { status: 400 },
    );
  }

  if (!body.persona) {
    return NextResponse.json(
      { error: "missing_field", field: "persona" },
      { status: 400 },
    );
  }

  let persona: RomanticProfile;
  if ("name" in body.persona) {
    persona = await upsertProfile(db, body.persona as RomanticProfile);
  } else {
    const found = await fetchProfile(db, body.persona.id);
    if (!found) {
      return NextResponse.json(
        { error: "persona_not_found", id: body.persona.id },
        { status: 404 },
      );
    }
    persona = found;
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const agentId = generateAgentId();

  await db
    .prepare(
      `INSERT INTO agents (id, api_key_hash, persona_id, display_name, operator, framework, status, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
    )
    .bind(
      agentId,
      apiKeyHash,
      persona.id,
      body.displayName,
      body.operator ?? null,
      body.framework ?? null,
    )
    .run();

  const row = await db
    .prepare(
      "SELECT id, persona_id, display_name, operator, framework, status, created_at, last_seen_at FROM agents WHERE id = ?",
    )
    .bind(agentId)
    .first<Record<string, unknown>>();

  if (!row) {
    return NextResponse.json({ error: "registration_failed" }, { status: 500 });
  }

  const response: AgentRegistrationResponse = {
    apiKey,
    persona,
    agent: {
      id: row.id as string,
      personaId: row.persona_id as string,
      displayName: row.display_name as string,
      operator: (row.operator as string | null) ?? null,
      framework: (row.framework as string | null) ?? null,
      status: ((row.status as string) || "active") as "active" | "suspended",
      createdAt: row.created_at as string,
      lastSeenAt: (row.last_seen_at as string | null) ?? null,
    },
  };

  return NextResponse.json(response, { status: 201 });
}
