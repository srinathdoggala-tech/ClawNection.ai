import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticateAgent } from "@/lib/agentPlatform/auth";
import { fetchProfile } from "@/lib/agentPlatform/persona";

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;

  const agent = await authenticateAgent(db, req);
  if (!agent) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const persona = await fetchProfile(db, agent.personaId);
  if (!persona) {
    return NextResponse.json({ error: "persona_missing" }, { status: 500 });
  }

  return NextResponse.json({ agent, persona });
}
