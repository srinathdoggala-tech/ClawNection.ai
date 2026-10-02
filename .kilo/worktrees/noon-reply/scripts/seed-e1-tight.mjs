#!/usr/bin/env node
/**
 * Seed the 9 E1 subject agents for HW7's tight 3-pair scope.
 *
 * Each subject agent reuses an existing persona (Daniel, Aisha, or Sophie)
 * but registers a fresh agent row tagged with framework="exp-e1-{condition}".
 * The cron handler in app/api/cron-heartbeat/route.ts reads that framework
 * value and slices THAT SUBJECT'S OWN persona context accordingly when
 * composing turns and verdicts.
 *
 * Pairings (driven by run-e1-tight.mjs):
 *   Pair A — Daniel-{rich|medium|thin} → Hannah  (high-compat control)
 *   Pair B — Aisha-{rich|medium|thin}  → Wes     (rich-only smoking conflict)
 *   Pair C — Sophie-{rich|medium|thin} → Marcus  (rich-only intent + age conflict)
 *
 * For B and C we slice the persona of the side carrying the dealbreaker —
 * the "subject" is whoever's preferences should fire when the conflict
 * surfaces. Aisha has the smoking dealbreaker; Sophie has the age preference.
 *
 * Idempotent at the persona-id level (POST /api/agent/register with
 * persona: { id } reuses the existing profile). Re-running creates fresh
 * agent rows each time — clean those up via D1 if needed.
 *
 * Writes credentials to e1-tight-subjects.local.json AND uploads them to
 * test_agent_credentials so the cron can act on their behalf.
 *
 * Usage:
 *   node scripts/seed-e1-tight.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

try {
  const text = readFileSync(join(REPO_ROOT, ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";

const SUBJECTS = [
  // Pair A — control. Daniel is the subject (could equally be Hannah; arbitrary).
  { name: "Daniel", personaId: "prf_z_yh5_Ssrm0rwxee", pair: "A", role: "control" },
  // Pair B — Aisha holds the smoking dealbreaker; she should decline Wes in rich.
  { name: "Aisha",  personaId: "prf_dgkZiC8EvS1R4U7r", pair: "B", role: "smoking-dealbreaker" },
  // Pair C — Sophie has the age preference (22-30, Marcus is 20 below);
  //         intent serious-dating (vs Marcus's exploring).
  { name: "Sophie", personaId: "prf_aZe3RfolyBvlgpPK", pair: "C", role: "intent-and-age-conflict" },
];

const CONDITIONS = ["rich", "medium", "thin"];

async function registerOne(subject, condition) {
  const framework = `exp-e1-${condition}`;
  const body = {
    displayName: `E1-${condition} subject (${subject.name}, pair ${subject.pair})`,
    operator: "experiment",
    framework,
    persona: { id: subject.personaId },
  };
  const res = await fetch(`${BASE_URL}/api/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `register ${subject.name}-${condition}: HTTP ${res.status} ${JSON.stringify(data)}`,
    );
  }
  return {
    pair: subject.pair,
    subjectName: subject.name,
    role: subject.role,
    condition,
    framework,
    agentId: data.agent.id,
    apiKey: data.apiKey,
    personaId: subject.personaId,
  };
}

(async () => {
  console.log("[seed-e1-tight] base URL:", BASE_URL);
  console.log(`[seed-e1-tight] seeding ${SUBJECTS.length * CONDITIONS.length} subject agents`);

  const results = [];
  for (const s of SUBJECTS) {
    for (const c of CONDITIONS) {
      process.stdout.write(`  ${s.name.padEnd(7)} ${c.padEnd(7)} `);
      try {
        const r = await registerOne(s, c);
        results.push(r);
        console.log("✓", r.agentId);
      } catch (err) {
        console.log("✗");
        console.error("    ", err.message);
      }
    }
  }

  // Save credentials locally
  const localPath = join(REPO_ROOT, "e1-tight-subjects.local.json");
  writeFileSync(
    localPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, subjects: results },
      null,
      2,
    ),
  );
  console.log(`[seed-e1-tight] credentials → ${localPath}`);

  // Upload to test_agent_credentials so cron handler can act as them
  const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  const sql = results
    .map((r) => {
      const id = r.agentId.replace(/'/g, "''");
      const key = r.apiKey.replace(/'/g, "''");
      return `INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES ('${id}', '${key}', 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1;`;
    })
    .join("\n");
  const tmp = join(REPO_ROOT, ".e1-tight-upload.sql");
  writeFileSync(tmp, sql);
  try {
    execFileSync(
      wrangler,
      ["d1", "execute", "clawnection-agentic-db", "--remote", "--file", tmp],
      { stdio: "inherit", env: process.env, cwd: REPO_ROOT },
    );
    console.log(`[seed-e1-tight] ✓ ${results.length} subject credentials uploaded to D1`);
  } finally {
    try {
      const fs = await import("node:fs");
      fs.unlinkSync(tmp);
    } catch {}
  }

  console.log("");
  console.log("=".repeat(60));
  console.log(`SEEDED ${results.length} E1 SUBJECT AGENTS (TIGHT SCOPE)`);
  console.log("=".repeat(60));
  for (const r of results) {
    console.log(
      `  pair=${r.pair} ${r.subjectName.padEnd(7)} ${r.condition.padEnd(7)} agent=${r.agentId}`,
    );
  }
  console.log("");
  console.log("Next: node scripts/run-e1-tight.mjs");
})().catch((err) => {
  console.error("[seed-e1-tight FAIL]", err);
  process.exit(1);
});
