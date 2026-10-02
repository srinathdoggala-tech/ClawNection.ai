#!/usr/bin/env node
/**
 * Seed the 2 additional subject agents needed for HW7 E2 + E3.
 *
 *   E2 (Haiku vs Sonnet): Daniel-sonnet — reuses Daniel's persona, framework
 *     "exp-e2-sonnet" so the cron handler swaps in Claude Sonnet when
 *     composing his messages and verdict.
 *
 *   E3 (Honesty prompt): Hannah-honesty — reuses Hannah's persona, framework
 *     "exp-e3-honesty" so the cron handler prepends the honesty preamble
 *     to her verdict prompt only.
 *
 * For E2 the comparison is Daniel-sonnet ↔ Hannah vs the existing
 * Daniel-rich (Haiku) ↔ Hannah from the E1 run.
 * For E3 the comparison is Daniel-rich ↔ Hannah-honesty vs the existing
 * Daniel-rich ↔ Hannah from the E1 run.
 *
 * Usage:
 *   node scripts/seed-e2-e3-tight.mjs
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
  {
    label: "Daniel-sonnet",
    personaId: "prf_z_yh5_Ssrm0rwxee",
    framework: "exp-e2-sonnet",
    experiment: "e2",
    description: "E2 — Daniel persona, Sonnet model",
  },
  {
    label: "Hannah-honesty",
    personaId: "prf_CHkqC8ATiaFVpj0L",
    framework: "exp-e3-honesty",
    experiment: "e3",
    description: "E3 — Hannah persona, honesty-emphasized verdict prompt",
  },
];

async function registerOne(s) {
  const body = {
    displayName: s.label,
    operator: "experiment",
    framework: s.framework,
    persona: { id: s.personaId },
  };
  const res = await fetch(`${BASE_URL}/api/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `register ${s.label}: HTTP ${res.status} ${JSON.stringify(data)}`,
    );
  }
  return {
    label: s.label,
    experiment: s.experiment,
    framework: s.framework,
    description: s.description,
    agentId: data.agent.id,
    apiKey: data.apiKey,
    personaId: s.personaId,
    personaName: data.persona?.name,
  };
}

(async () => {
  console.log("[seed-e2-e3] base URL:", BASE_URL);
  const results = [];
  for (const s of SUBJECTS) {
    process.stdout.write(`  ${s.label.padEnd(20)} `);
    try {
      const r = await registerOne(s);
      results.push(r);
      console.log("✓", r.agentId);
    } catch (err) {
      console.log("✗");
      console.error("    ", err.message);
    }
  }

  const localPath = join(REPO_ROOT, "e2-e3-tight-subjects.local.json");
  writeFileSync(
    localPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, subjects: results },
      null,
      2,
    ),
  );
  console.log(`[seed-e2-e3] credentials → ${localPath}`);

  const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  const sql = results
    .map((r) => {
      const id = r.agentId.replace(/'/g, "''");
      const key = r.apiKey.replace(/'/g, "''");
      return `INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES ('${id}', '${key}', 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1;`;
    })
    .join("\n");
  const tmp = join(REPO_ROOT, ".e2-e3-upload.sql");
  writeFileSync(tmp, sql);
  try {
    execFileSync(
      wrangler,
      ["d1", "execute", "clawnection-agentic-db", "--remote", "--file", tmp],
      { stdio: "inherit", env: process.env, cwd: REPO_ROOT },
    );
    console.log(`[seed-e2-e3] ✓ ${results.length} credentials uploaded to D1`);
  } finally {
    try {
      const fs = await import("node:fs");
      fs.unlinkSync(tmp);
    } catch {}
  }

  console.log("");
  console.log("=".repeat(60));
  console.log(`SEEDED ${results.length} E2/E3 SUBJECT AGENTS`);
  console.log("=".repeat(60));
  for (const r of results) {
    console.log(
      `  ${r.experiment.toUpperCase()} ${r.label.padEnd(20)} agent=${r.agentId}`,
    );
  }
  console.log("");
  console.log("Next: node scripts/run-e2-e3-tight.mjs");
})().catch((err) => {
  console.error("[seed-e2-e3 FAIL]", err);
  process.exit(1);
});
