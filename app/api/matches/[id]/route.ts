import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";


export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as CloudflareEnv).DB;
  const { id } = await params;

  const row = await db
    .prepare("SELECT result_json FROM match_results WHERE id = ?")
    .bind(id)
    .first();

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(JSON.parse(row.result_json as string));
}
