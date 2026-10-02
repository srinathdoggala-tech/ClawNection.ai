#!/usr/bin/env node
/**
 * Control validation for the verdict-redesign experiment.
 *
 * Fires 3 high-compatibility dates with the new multi-dimensional
 * verdict prompt active. We expect mutual yes on all three — proves
 * the system isn't just biased toward "no" but actually discriminates.
 *
 * If the borderline experiment shows 5/5 mutual no AND this control
 * shows 3/3 mutual yes, we've demonstrated the full 3-outcome space:
 *   - decline-at-invite (works at hard-signal mismatch)
 *   - completed-no (NEW — works at conversation-emergent conflict)
 *   - mutual-yes (still works on genuine compatibility)
 *
 * Pairs (all from existing test-bot fleet, all hand-crafted high-compat):
 *   Daniel ↔ Hannah (29/29, both medical, kindness-aligned)
 *   Andre  ↔ Priya  (26/26, both growth+honesty, both early-bird)
 *   Eric   ↔ Diane  (47/47, both stable, both grown kids)
 *
 * Usage:
 *   node scripts/run-control-validation.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

const args = process.argv.slice(2);
const flagN = (name, fb) => {
  const i = args.indexOf(name);
  if (i === -1) return fb;
  const v = args[i + 1];
  return v === undefined || v.startsWith("--") ? true : Number(v);
};
const MAX_TURNS = flagN("--max-turns", 4);
const TICK_INTERVAL_S = flagN("--tick-interval", 8);
const MAX_TICKS = flagN("--max-ticks", 60);
const MODEL = "claude-haiku-4-5-20251001";

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_HEARTBEAT_SECRET;
if (!ANTHROPIC_KEY || !CRON_SECRET) {
  console.error("[control] missing env keys");
  process.exit(2);
}

// Pull credentials from existing local files. Daniel + Hannah are E1 subject
// agents (Daniel-rich) plus regular test-bot Hannah. Andre + Priya + Eric +
// Diane don't have stored credentials — we register fresh agents for them.
const e1 = JSON.parse(readFileSync(join(REPO_ROOT, "e1-tight-subjects.local.json"), "utf8")).subjects;
const danielRich = e1.find((s) => s.subjectName === "Daniel" && s.condition === "rich");

// For Pair A we use Daniel-rich → Hannah test-bot agent (already exists).
// For Pair B (Andre/Priya) and C (Eric/Diane) we register fresh agents
// pointing at their existing personas.

// Persona IDs (from earlier D1 query).
const PERSONA_IDS = {
  Daniel: "prf_z_yh5_Ssrm0rwxee",
  Hannah: "prf_CHkqC8ATiaFVpj0L",
  Andre:  null, // looked up below
  Priya:  null,
  Eric:   null,
  Diane:  null,
};

// We need persona IDs for Andre/Priya/Eric/Diane. Hardcode after one quick query
// (could query at runtime, but persona_id never changes once seeded).
async function lookupPersonaIds() {
  const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(
    wrangler,
    [
      "d1", "execute", "clawnection-agentic-db", "--remote",
      "--command", `SELECT id, name FROM profiles WHERE name IN ('Andre','Priya','Eric','Diane')`,
      "--json",
    ],
    { env: process.env, cwd: REPO_ROOT },
  ).toString();
  const parsed = JSON.parse(out);
  const rows = parsed?.[0]?.results ?? [];
  for (const r of rows) PERSONA_IDS[r.name] = r.id;
  console.log("[control] persona IDs:", PERSONA_IDS);
}

async function api(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(`${method} ${path} → HTTP ${res.status} ${JSON.stringify(json)}`);
    err.body = json;
    throw err;
  }
  return json;
}

async function asAgent(apiKey, method, path, body) {
  return api(method, path, { body, headers: { Authorization: `Bearer ${apiKey}` } });
}

async function cron(limit = 10) {
  return api("GET", `/api/cron-heartbeat?limit=${limit}`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
}

async function claude(systemPrompt, userPrompt, maxTokens = 200) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).content?.find?.((b) => b.type === "text")?.text?.trim?.() || "";
}

async function registerControlAgent(personaName, personaId) {
  const r = await api("POST", "/api/agent/register", {
    body: {
      displayName: `${personaName} control-validation`,
      operator: "experiment",
      framework: "test-bot",
      persona: { id: personaId },
    },
  });
  return { agentId: r.agent.id, apiKey: r.apiKey, personaId, personaName };
}

(async () => {
  await lookupPersonaIds();

  // Hannah test-bot agent ID is hardcoded from earlier (HW7/HW8 runs).
  const HANNAH_AGENT_ID = "agt_Hp98YF1MOWwNEHNc";

  // Register fresh agents for Andre, Priya, Eric, Diane (one each as
  // initiator, plus separate one for recipient).
  const andre = await registerControlAgent("Andre", PERSONA_IDS.Andre);
  const priya = await registerControlAgent("Priya", PERSONA_IDS.Priya);
  const eric = await registerControlAgent("Eric", PERSONA_IDS.Eric);
  const diane = await registerControlAgent("Diane", PERSONA_IDS.Diane);

  // Upload credentials to test_agent_credentials so cron can act for them
  const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  const { execFileSync } = await import("node:child_process");
  const allCreds = [andre, priya, eric, diane];
  const sql = allCreds
    .map((c) => {
      const id = c.agentId.replace(/'/g, "''");
      const k = c.apiKey.replace(/'/g, "''");
      return `INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES ('${id}', '${k}', 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1;`;
    })
    .join("\n");
  const tmp = join(REPO_ROOT, ".control-creds-upload.sql");
  writeFileSync(tmp, sql);
  try {
    execFileSync(
      wrangler,
      ["d1", "execute", "clawnection-agentic-db", "--remote", "--file", tmp],
      { stdio: "inherit", env: process.env, cwd: REPO_ROOT },
    );
  } finally {
    try { (await import("node:fs")).unlinkSync(tmp); } catch {}
  }

  // Persona snapshots for opening-message composition
  const PERSONAS = {
    Daniel: (await asAgent(danielRich.apiKey, "GET", "/api/agent/me")).persona,
    Hannah: { name: "Hannah", age: 29 }, // we don't need full snapshot for Hannah-as-recipient, just the agent ID
  };
  PERSONAS.Andre = (await asAgent(andre.apiKey, "GET", "/api/agent/me")).persona;
  PERSONAS.Priya = (await asAgent(priya.apiKey, "GET", "/api/agent/me")).persona;
  PERSONAS.Eric = (await asAgent(eric.apiKey, "GET", "/api/agent/me")).persona;
  PERSONAS.Diane = (await asAgent(diane.apiKey, "GET", "/api/agent/me")).persona;

  // The 3 high-compat control pairs
  const PAIRS = [
    {
      label: "control-Daniel-Hannah",
      initiator: { apiKey: danielRich.apiKey, personaName: "Daniel", persona: PERSONAS.Daniel },
      recipientAgentId: HANNAH_AGENT_ID,
      recipientName: "Hannah",
      recipientPersona: PERSONAS.Daniel, // not used for opening (we only need to introduce ourself)
    },
    {
      label: "control-Andre-Priya",
      initiator: { apiKey: andre.apiKey, personaName: "Andre", persona: PERSONAS.Andre },
      recipientAgentId: priya.agentId,
      recipientName: "Priya",
      recipientPersona: PERSONAS.Priya,
    },
    {
      label: "control-Eric-Diane",
      initiator: { apiKey: eric.apiKey, personaName: "Eric", persona: PERSONAS.Eric },
      recipientAgentId: diane.agentId,
      recipientName: "Diane",
      recipientPersona: PERSONAS.Diane,
    },
  ];

  const dates = [];
  for (const p of PAIRS) {
    process.stdout.write(`  ${p.label.padEnd(28)} `);
    try {
      const sys = `You are ${p.initiator.personaName}'s dating agent. Compose a 1–2 sentence opening message to ${p.recipientName}. Reference one specific thing from their persona. Output the raw message only — no quotes, no "Name:" prefix.

YOUR HUMAN'S PERSONA:
${JSON.stringify(p.initiator.persona, null, 2)}

THEIR PERSONA:
${JSON.stringify(p.recipientPersona, null, 2)}`;
      const opening = await claude(sys, "Write the opening message now.", 200);
      const init = await asAgent(p.initiator.apiKey, "POST", "/api/dates", {
        recipientAgentId: p.recipientAgentId,
        openingMessage: opening,
        maxTurns: MAX_TURNS,
        experimentCohort: p.label,
        subjectModel: MODEL,
      });
      console.log("✓", init.date.id);
      dates.push({ label: p.label, dateId: init.date.id, opening });
    } catch (err) {
      console.log("✗", err.message);
    }
  }

  console.log(`\nFired ${dates.length} control dates. Driving cron…`);
  for (let i = 1; i <= MAX_TICKS; i++) {
    let totals = null;
    try { totals = (await cron(10)).totals; } catch (err) { /* swallow */ }
    const statuses = await Promise.all(
      dates.map((d) => api("GET", `/api/public/dates/${d.dateId}`).then((r) => r.date.status, () => "unknown")),
    );
    const counts = {};
    for (const s of statuses) counts[s] = (counts[s] || 0) + 1;
    process.stdout.write(`  tick ${i}/${MAX_TICKS} `);
    if (totals) process.stdout.write(`(${totals.agentsProcessed}a ${totals.invitesProcessed}inv ${totals.messagesSent}msg ${totals.verdictsSubmitted}v ${totals.totalErrors}err) `);
    process.stdout.write(`states: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}\n`);
    if (statuses.every((s) => s === "completed" || s === "declined")) {
      console.log(`\n→ All ${dates.length} dates terminal after ${i} ticks.`);
      return;
    }
    if (i < MAX_TICKS) await new Promise((r) => setTimeout(r, TICK_INTERVAL_S * 1000));
  }
})().catch((err) => {
  console.error("[control FATAL]", err);
  process.exit(1);
});
