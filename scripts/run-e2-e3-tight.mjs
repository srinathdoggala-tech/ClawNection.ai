#!/usr/bin/env node
/**
 * Fire 2 dates for HW7 E2 + E3 minimum experiments.
 *
 *   E2: Daniel-sonnet → Hannah        (compare to existing Daniel-rich → Hannah)
 *   E3: Daniel-rich    → Hannah-honesty (compare to existing Daniel-rich → Hannah)
 *
 * Then drives /api/cron-heartbeat in a tight loop until both dates terminal.
 * Appends results to experiment-runs.local.json.
 *
 * For E2 we use Daniel-sonnet as initiator. For E3 we need Daniel-rich (E1
 * subject) to initiate against Hannah-honesty as recipient, so we look up
 * Daniel-rich's API key in e1-tight-subjects.local.json.
 *
 * Usage:
 *   node scripts/run-e2-e3-tight.mjs
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
function flag(name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}

const MAX_TURNS = Number(flag("--max-turns", 4));
const TICK_INTERVAL_S = Number(flag("--tick-interval", 8));
const MAX_TICKS = Number(flag("--max-ticks", 60));
const NO_DRIVE = args.includes("--no-drive");
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_HEARTBEAT_SECRET;

if (!ANTHROPIC_KEY) {
  console.error("[run-e2-e3] ANTHROPIC_API_KEY not set");
  process.exit(2);
}
if (!CRON_SECRET) {
  console.error("[run-e2-e3] CRON_HEARTBEAT_SECRET not set");
  process.exit(2);
}

const e1SubjectsPath = join(REPO_ROOT, "e1-tight-subjects.local.json");
const e23SubjectsPath = join(REPO_ROOT, "e2-e3-tight-subjects.local.json");
if (!existsSync(e1SubjectsPath) || !existsSync(e23SubjectsPath)) {
  console.error("[run-e2-e3] Missing local subject files. Run seed-e1-tight.mjs and seed-e2-e3-tight.mjs first.");
  process.exit(2);
}
const e1Subjects = JSON.parse(readFileSync(e1SubjectsPath, "utf8")).subjects;
const e23Subjects = JSON.parse(readFileSync(e23SubjectsPath, "utf8")).subjects;

const danielRich = e1Subjects.find((s) => s.subjectName === "Daniel" && s.condition === "rich");
const danielSonnet = e23Subjects.find((s) => s.label === "Daniel-sonnet");
const hannahHonesty = e23Subjects.find((s) => s.label === "Hannah-honesty");
if (!danielRich || !danielSonnet || !hannahHonesty) {
  console.error("[run-e2-e3] Could not find required subjects in local files.");
  process.exit(2);
}

// Persona snapshots — same as run-e1-tight.mjs to avoid auth round-trips.
const HANNAH_PERSONA = {
  name: "Hannah", age: 29, genderIdentity: "Female", lookingFor: "Men",
  location: "Brookline, MA", relationshipIntent: "long-term",
  bio: "Pediatric OT. Big on long walks, used bookstores, and rainy-day reading. Dog person, allergic to cats.",
  interests: ["reading", "long walks", "thrift stores"],
  values: ["kindness", "reliability", "curiosity"],
  lifestyleHabits: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
  dealbreakers: ["smoking", "dishonesty"],
  idealFirstDate: "Sourdough at a café, then a slow museum.",
};

// Hannah's regular test-bot agent ID (recipient for E2)
const HANNAH_AGENT_ID = "agt_Hp98YF1MOWwNEHNc";

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const step = (msg) => console.log(`\n→ ${msg}`);

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

async function claude(systemPrompt, userPrompt, maxTokens = 250, model = HAIKU_MODEL) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.content?.find?.((b) => b.type === "text")?.text?.trim?.() || "";
}

async function fireDate({ subject, recipientAgentId, recipientName, recipientPersona, cohort, model }) {
  const me = await asAgent(subject.apiKey, "GET", "/api/agent/me");
  const sys = `You are ${me.persona.name}'s dating agent. Compose a 1–2 sentence opening message to ${recipientName}. Reference one specific thing from their persona. Output the raw message only — no quotes, no "Name:" prefix.

YOUR HUMAN'S PERSONA:
${JSON.stringify(me.persona, null, 2)}

THEIR PERSONA:
${JSON.stringify(recipientPersona, null, 2)}`;
  const opening = await claude(sys, "Write the opening message now.", 200, model);
  const init = await asAgent(subject.apiKey, "POST", "/api/dates", {
    recipientAgentId,
    openingMessage: opening,
    maxTurns: MAX_TURNS,
    experimentCohort: cohort,
    subjectModel: model,
  });
  return { dateId: init.date.id, opening };
}

(async () => {
  log("base URL:", BASE_URL);
  const dates = [];

  step("E2: Daniel-sonnet → Hannah");
  try {
    const r = await fireDate({
      subject: { apiKey: danielSonnet.apiKey, subjectName: "Daniel", condition: "sonnet" },
      recipientAgentId: HANNAH_AGENT_ID,
      recipientName: "Hannah",
      recipientPersona: HANNAH_PERSONA,
      cohort: "e2-sonnet",
      model: "claude-sonnet-4-6",
    });
    log(`  ✓ ${r.dateId}`);
    dates.push({
      experiment: "e2",
      condition: "sonnet",
      subjectAgentId: danielSonnet.agentId,
      subjectName: "Daniel",
      recipientName: "Hannah",
      recipientAgentId: HANNAH_AGENT_ID,
      cohort: "e2-sonnet",
      ...r,
    });
  } catch (err) {
    if (err.body?.error === "date_already_in_progress") {
      log(`  ⚠ already in progress (${err.body.dateId}); reusing`);
      dates.push({
        experiment: "e2",
        condition: "sonnet",
        subjectAgentId: danielSonnet.agentId,
        subjectName: "Daniel",
        recipientName: "Hannah",
        recipientAgentId: HANNAH_AGENT_ID,
        cohort: "e2-sonnet",
        dateId: err.body.dateId,
        opening: null,
        note: "preexisting",
      });
    } else {
      log(`  ✗ ${err.message}`);
    }
  }

  step("E3: Daniel-rich → Hannah-honesty");
  try {
    const r = await fireDate({
      subject: { apiKey: danielRich.apiKey, subjectName: "Daniel", condition: "rich" },
      recipientAgentId: hannahHonesty.agentId,
      recipientName: "Hannah",
      recipientPersona: HANNAH_PERSONA,
      cohort: "e3-honesty",
      model: HAIKU_MODEL,
    });
    log(`  ✓ ${r.dateId}`);
    dates.push({
      experiment: "e3",
      condition: "honesty",
      subjectAgentId: danielRich.agentId,
      recipientName: "Hannah-honesty",
      recipientAgentId: hannahHonesty.agentId,
      cohort: "e3-honesty",
      ...r,
    });
  } catch (err) {
    if (err.body?.error === "date_already_in_progress") {
      log(`  ⚠ already in progress (${err.body.dateId}); reusing`);
      dates.push({
        experiment: "e3",
        condition: "honesty",
        subjectAgentId: danielRich.agentId,
        recipientName: "Hannah-honesty",
        recipientAgentId: hannahHonesty.agentId,
        cohort: "e3-honesty",
        dateId: err.body.dateId,
        opening: null,
        note: "preexisting",
      });
    } else {
      log(`  ✗ ${err.message}`);
    }
  }

  // Append to experiment-runs.local.json
  const runPath = join(REPO_ROOT, "experiment-runs.local.json");
  let manifest = {};
  if (existsSync(runPath)) {
    try { manifest = JSON.parse(readFileSync(runPath, "utf8")); } catch {}
  }
  manifest.e2_e3_dates = dates;
  manifest.e2_e3_generatedAt = new Date().toISOString();
  writeFileSync(runPath, JSON.stringify(manifest, null, 2));
  step(`appended to ${runPath} (${dates.length} new dates)`);

  if (NO_DRIVE) return;

  step(`Driving cron — up to ${MAX_TICKS} ticks, ${TICK_INTERVAL_S}s between ticks…`);
  for (let i = 1; i <= MAX_TICKS; i++) {
    process.stdout.write(`  tick ${i}/${MAX_TICKS} — `);
    try {
      const r = await cron(10);
      const t = r.totals;
      process.stdout.write(`${t.agentsProcessed} agents, ${t.invitesProcessed} invites, ${t.messagesSent} msgs, ${t.verdictsSubmitted} verdicts, ${t.totalErrors} errs`);
    } catch (err) {
      process.stdout.write(`cron error: ${err.message}`);
    }
    process.stdout.write("\n");

    const statuses = await Promise.all(
      dates.map((d) =>
        api("GET", `/api/public/dates/${d.dateId}`).then(
          (r) => r.date.status,
          () => "unknown",
        ),
      ),
    );
    const counts = {};
    for (const s of statuses) counts[s] = (counts[s] || 0) + 1;
    log(`  states: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}`);

    if (statuses.every((s) => s === "completed" || s === "declined")) {
      step(`Both dates terminal — done after ${i} ticks.`);
      return;
    }
    if (i < MAX_TICKS) await new Promise((r) => setTimeout(r, TICK_INTERVAL_S * 1000));
  }
  step(`Reached tick budget. Some dates may still be active.`);
})().catch((err) => {
  console.error("[run-e2-e3 FATAL]", err);
  process.exit(1);
});
