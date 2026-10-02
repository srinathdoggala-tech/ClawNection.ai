#!/usr/bin/env node
/**
 * Seed 9 fresh test-bot initiator agents for HW8's Path A + scale run.
 *
 * Three new agents per persona (Wes, Marcus, Hannah). Each fresh agent
 * initiates 3 dates (one to each condition-tagged recipient), producing
 * 9 unique (initiator, recipient) tuples per pair × 3 pairs = 27 dates.
 *
 * All 9 are framework="test-bot" so the cron handler treats them like
 * the regular test-bot fleet (full persona, no slicing applied to them).
 * The slicing happens on the *recipient* side, which has a framework
 * exp-e1-{rich|medium|thin}.
 *
 * Idempotent at the persona-id level: re-running registers fresh agent
 * rows reusing the same persona, so the same persona has multiple agents.
 *
 * Usage:
 *   node scripts/seed-hw8-initiators.mjs
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

// 3 trials × 3 personas = 9 fresh initiator agents
const PERSONAS = [
  { name: "Wes",    personaId: "prf_OFL7WltKW3gzPLge", pair: "B" },
  { name: "Marcus", personaId: "prf_ortTKoF7uE-BdQX5", pair: "C" },
  { name: "Hannah", personaId: "prf_CHkqC8ATiaFVpj0L", pair: "A" },
];
const TRIALS_PER_PERSONA = 3;

async function registerOne(p, trial) {
  const body = {
    displayName: `${p.name} HW8 initiator #${trial}`,
    operator: "experiment",
    framework: "test-bot",
    persona: { id: p.personaId },
  };
  const res = await fetch(`${BASE_URL}/api/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `register ${p.name}#${trial}: HTTP ${res.status} ${JSON.stringify(data)}`,
    );
  }
  return {
    personaName: p.name,
    pair: p.pair,
    trial,
    agentId: data.agent.id,
    apiKey: data.apiKey,
    personaId: p.personaId,
  };
}

(async () => {
  console.log("[seed-hw8] base URL:", BASE_URL);
  console.log(`[seed-hw8] registering ${PERSONAS.length * TRIALS_PER_PERSONA} fresh initiator agents`);

  const results = [];
  for (const p of PERSONAS) {
    for (let trial = 1; trial <= TRIALS_PER_PERSONA; trial++) {
      process.stdout.write(`  pair=${p.pair} ${p.name}#${trial} `);
      try {
        const r = await registerOne(p, trial);
        results.push(r);
        console.log("✓", r.agentId);
      } catch (err) {
        console.log("✗");
        console.error("    ", err.message);
      }
    }
  }

  const localPath = join(REPO_ROOT, "hw8-initiators.local.json");
  writeFileSync(
    localPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, initiators: results },
      null,
      2,
    ),
  );
  console.log(`[seed-hw8] credentials → ${localPath}`);

  const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  const sql = results
    .map((r) => {
      const id = r.agentId.replace(/'/g, "''");
      const key = r.apiKey.replace(/'/g, "''");
      return `INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES ('${id}', '${key}', 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1;`;
    })
    .join("\n");
  const tmp = join(REPO_ROOT, ".hw8-initiators-upload.sql");
  writeFileSync(tmp, sql);
  try {
    execFileSync(
      wrangler,
      ["d1", "execute", "clawnection-agentic-db", "--remote", "--file", tmp],
      { stdio: "inherit", env: process.env, cwd: REPO_ROOT },
    );
    console.log(`[seed-hw8] ✓ ${results.length} credentials uploaded to D1`);
  } finally {
    try {
      const fs = await import("node:fs");
      fs.unlinkSync(tmp);
    } catch {}
  }

  console.log("");
  console.log("=".repeat(60));
  console.log(`SEEDED ${results.length} FRESH HW8 INITIATOR AGENTS`);
  console.log("=".repeat(60));
  for (const r of results) {
    console.log(`  pair=${r.pair} ${r.personaName}#${r.trial}  agent=${r.agentId}`);
  }
  console.log("");
  console.log("Next: node scripts/run-hw8.mjs");
})().catch((err) => {
  console.error("[seed-hw8 FAIL]", err);
  process.exit(1);
});
