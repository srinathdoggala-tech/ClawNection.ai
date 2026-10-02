#!/usr/bin/env node
/**
 * Seed the 3 E1 subject agents (rich / medium / thin persona-context conditions).
 * All three share Dee's persona — same identity, same DB row. They differ only
 * in the `framework` column, which the cron handler reads to choose how much
 * persona context to feed Claude when composing turns and verdicts.
 *
 * Idempotent at the persona-id level (POST /api/agent/register with
 * persona: { id } reuses the existing profile).
 *
 * Usage:
 *   node scripts/seed-experiment-subjects.mjs
 *
 * Writes credentials to experiment-subjects.local.json (gitignored) and to
 * the test_agent_credentials table so the cron handler can act on their
 * behalf.
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
const PERSONA_ID = "local-dee";

const SUBJECTS = [
  { framework: "exp-e1-rich",   condition: "rich",   description: "Full persona JSON in every prompt" },
  { framework: "exp-e1-medium", condition: "medium", description: "Bio + 3 interests + age + location only" },
  { framework: "exp-e1-thin",   condition: "thin",   description: "Name + age + 1-line bio only" },
];

const log = (...a) => console.log("[seed-subjects]", ...a);

async function registerOne(condition, framework) {
  const body = {
    displayName: `E1-${condition} subject (Dee)`,
    operator: "experiment",
    framework,
    persona: { id: PERSONA_ID },
  };
  const res = await fetch(`${BASE_URL}/api/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`register ${framework}: HTTP ${res.status} ${JSON.stringify(data)}`);
  return {
    condition,
    framework,
    agentId: data.agent.id,
    apiKey: data.apiKey,
    personaName: data.persona.name,
  };
}

(async () => {
  log("Base URL:", BASE_URL);
  log("Reusing persona:", PERSONA_ID);

  const results = [];
  for (const s of SUBJECTS) {
    process.stdout.write(`  ${s.framework.padEnd(15)} `);
    try {
      const r = await registerOne(s.condition, s.framework);
      results.push({ ...r, description: s.description });
      console.log("✓", r.agentId);
    } catch (err) {
      console.log("✗");
      console.error("    ", err.message);
    }
  }

  // Save credentials locally
  const localPath = join(REPO_ROOT, "experiment-subjects.local.json");
  writeFileSync(
    localPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, subjects: results }, null, 2),
  );
  log(`credentials → ${localPath}`);

  // Push to test_agent_credentials so the cron handler can act as them
  const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  const sql = results
    .map((r) => {
      const id = r.agentId.replace(/'/g, "''");
      const key = r.apiKey.replace(/'/g, "''");
      return `INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES ('${id}', '${key}', 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1;`;
    })
    .join("\n");
  const tmp = join(REPO_ROOT, ".exp-subjects-upload.sql");
  writeFileSync(tmp, sql);
  try {
    execFileSync(
      wrangler,
      ["d1", "execute", "clawnection-agentic-db", "--remote", "--file", tmp],
      { stdio: "inherit", env: process.env, cwd: REPO_ROOT },
    );
    log(`✓ ${results.length} subject credentials uploaded to D1`);
  } finally {
    try {
      const fs = await import("node:fs");
      fs.unlinkSync(tmp);
    } catch {}
  }

  console.log("");
  console.log("=".repeat(60));
  console.log(`SEEDED ${results.length} EXPERIMENT-SUBJECT AGENTS`);
  console.log("=".repeat(60));
  for (const r of results) {
    console.log(`  ${r.condition.padEnd(7)} ${r.agentId}  framework=${r.framework}`);
  }
})().catch((err) => {
  console.error("[seed-subjects FAIL]", err);
  process.exit(1);
});
