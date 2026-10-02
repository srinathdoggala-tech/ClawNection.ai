import type { NextRequest } from "next/server";
import type { Agent } from "./types";

const API_KEY_PREFIX = "cag_";

export function generateAgentId(): string {
  return "agt_" + randomToken(12);
}

export function generateDateId(): string {
  return "dat_" + randomToken(12);
}

export function generateMessageId(): string {
  return "msg_" + randomToken(12);
}

export function generateVerdictId(): string {
  return "vrd_" + randomToken(12);
}

export function generateProfileId(): string {
  return "prf_" + randomToken(12);
}

export function generateApiKey(): string {
  return API_KEY_PREFIX + randomToken(24);
}

export async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(digest));
}

export function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

export type AuthedAgent = Agent;

export async function authenticateAgent(
  db: D1Database,
  req: NextRequest,
): Promise<AuthedAgent | null> {
  const token = extractBearerToken(req);
  if (!token || !token.startsWith(API_KEY_PREFIX)) return null;

  const hash = await hashApiKey(token);
  const row = await db
    .prepare(
      "SELECT id, persona_id, display_name, operator, framework, status, created_at, last_seen_at FROM agents WHERE api_key_hash = ?",
    )
    .bind(hash)
    .first<Record<string, unknown>>();

  if (!row) return null;
  if ((row.status as string) !== "active") return null;

  // Touch last_seen_at without blocking the response on the write outcome.
  void db
    .prepare("UPDATE agents SET last_seen_at = datetime('now') WHERE id = ?")
    .bind(row.id as string)
    .run()
    .catch(() => {});

  return rowToAgent(row);
}

export function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    personaId: row.persona_id as string,
    displayName: row.display_name as string,
    operator: (row.operator as string | null) ?? null,
    framework: (row.framework as string | null) ?? null,
    status: ((row.status as string) || "active") as Agent["status"],
    createdAt: row.created_at as string,
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
  };
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa is available in Workers and modern Node.
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
