#!/usr/bin/env node
/**
 * E1 (persona-richness ablation) — tight 3-pair runner.
 *
 * Reads the 9 subject agents from e1-tight-subjects.local.json (produced
 * by seed-e1-tight.mjs) and fires 9 SPECIFIC dates — one per (pair × condition).
 *
 *   Pair A — Daniel-{rich|medium|thin} → Hannah  (control, expect mutual yes)
 *   Pair B — Aisha-{rich|medium|thin}  → Wes     (rich expects no, others yes)
 *   Pair C — Sophie-{rich|medium|thin} → Marcus  (rich expects no, others yes)
 *
 * Recipient agent IDs are hard-coded since the experiment specifies pairings.
 * Then drives /api/cron-heartbeat in a tight loop until all dates terminal,
 * augmenting the natural Cloudflare cron (every 2 min) with manual ticks
 * (every 8 sec) to drain in roughly 1-2 min.
 *
 * Writes manifest to experiment-runs.local.json for analyze-experiment.mjs.
 *
 * Usage:
 *   node scripts/run-e1-tight.mjs
 *   node scripts/run-e1-tight.mjs --max-turns 4
 *   node scripts/run-e1-tight.mjs --no-drive   # just initiate, let cron drain
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
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_HEARTBEAT_SECRET;

if (!ANTHROPIC_KEY) {
  console.error("[run-e1] ANTHROPIC_API_KEY not set in env or .env.local");
  process.exit(2);
}
if (!CRON_SECRET) {
  console.error("[run-e1] CRON_HEARTBEAT_SECRET not set");
  process.exit(2);
}

const subjectsPath = join(REPO_ROOT, "e1-tight-subjects.local.json");
if (!existsSync(subjectsPath)) {
  console.error(`[run-e1] ${subjectsPath} not found. Run scripts/seed-e1-tight.mjs first.`);
  process.exit(2);
}
const subjects = JSON.parse(readFileSync(subjectsPath, "utf8")).subjects;

// Recipient agent IDs + inline persona snapshots are fixed per pair.
// Personas are inlined here (not fetched live) to avoid auth round-trips and
// keep the runner self-contained. These match the rows in production D1.
const RECIPIENTS = {
  A: {
    name: "Hannah",
    agentId: "agt_Hp98YF1MOWwNEHNc",
    personaId: "prf_CHkqC8ATiaFVpj0L",
    persona: {
      name: "Hannah", age: 29, genderIdentity: "Female", lookingFor: "Men",
      location: "Brookline, MA", relationshipIntent: "long-term",
      bio: "Pediatric OT. Big on long walks, used bookstores, and rainy-day reading. Dog person, allergic to cats.",
      interests: ["reading", "long walks", "thrift stores"],
      values: ["kindness", "reliability", "curiosity"],
      lifestyleHabits: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Sourdough at a café, then a slow museum.",
    },
  },
  B: {
    name: "Wes",
    agentId: "agt_QpSLjZ3rbIFo_mGF",
    personaId: "prf_OFL7WltKW3gzPLge",
    persona: {
      name: "Wes", age: 35, genderIdentity: "Male", lookingFor: "Women",
      location: "Allston, MA", relationshipIntent: "exploring",
      bio: "Bartender in Allston, work nights and weekends are music venues. Casual and present, not looking to settle.",
      interests: ["live music", "guitar", "nightlife"],
      values: ["fun", "freedom", "honesty"],
      lifestyleHabits: { sleepSchedule: "night-owl", socialEnergy: "high-energy", activityLevel: "sedentary", drinking: "heavy", smoking: "regular" },
      dealbreakers: [],
      idealFirstDate: "Late drinks somewhere loud, then a band if it's a good night.",
    },
  },
  C: {
    name: "Marcus",
    agentId: "agt_Fu0oj2pX-Rk60ohL",
    personaId: "prf_ortTKoF7uE-BdQX5",
    persona: {
      name: "Marcus", age: 20, genderIdentity: "Male", lookingFor: "Women",
      location: "Cambridge, MA", relationshipIntent: "exploring",
      bio: "Sophomore studying CS, ran cross-country in high school, learning to bake. Looking for someone who'll let me try out a new sourdough recipe on them.",
      interests: ["running", "baking", "video games"],
      values: ["honesty", "growth", "humor"],
      lifestyleHabits: { sleepSchedule: "night-owl", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking"],
      idealFirstDate: "Coffee on a porch, then a long walk.",
    },
  },
};

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
    err.status = res.status;
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

async function claude(systemPrompt, userPrompt, maxTokens = 250) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
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

(async () => {
  log("base URL:", BASE_URL);
  log(`subjects: ${subjects.length}, max turns: ${MAX_TURNS}`);

  const allDates = [];

  for (const subject of subjects) {
    const recipient = RECIPIENTS[subject.pair];
    if (!recipient) {
      log(`  ✗ no recipient configured for pair ${subject.pair}`);
      continue;
    }
    process.stdout.write(`  pair=${subject.pair} ${subject.subjectName}-${subject.condition} → ${recipient.name} … `);

    // Fetch subject's persona for opening composition.
    let me;
    try {
      me = await asAgent(subject.apiKey, "GET", "/api/agent/me");
    } catch (err) {
      console.log("✗ /api/agent/me", err.message);
      continue;
    }

    // Recipient persona is inlined in RECIPIENTS table above (no fetch needed).
    const recipientPersona = recipient.persona;

    // Compose opening with full persona context (slicing applies to subject's
    // OWN view of self, not to the opening composition).
    const sys = `You are ${me.persona.name}'s dating agent. Compose a 1–2 sentence opening message to ${recipient.name}. Reference one specific thing from their persona. Output the raw message only — no quotes, no "Name:" prefix.

YOUR HUMAN'S PERSONA:
${JSON.stringify(me.persona, null, 2)}

THEIR PERSONA:
${JSON.stringify(recipientPersona, null, 2)}`;

    let opening;
    try {
      opening = await claude(sys, "Write the opening message now.", 200);
    } catch (err) {
      console.log("✗ opening:", err.message);
      continue;
    }

    const cohort = `e1-${subject.condition}`;
    try {
      const init = await asAgent(subject.apiKey, "POST", "/api/dates", {
        recipientAgentId: recipient.agentId,
        openingMessage: opening,
        maxTurns: MAX_TURNS,
        experimentCohort: cohort,
        subjectModel: MODEL,
      });
      allDates.push({
        pair: subject.pair,
        condition: subject.condition,
        cohort,
        subjectName: subject.subjectName,
        subjectAgentId: subject.agentId,
        recipientName: recipient.name,
        recipientAgentId: recipient.agentId,
        dateId: init.date.id,
        opening,
        initiatedAt: new Date().toISOString(),
      });
      console.log("✓", init.date.id);
    } catch (err) {
      if (err.body?.error === "date_already_in_progress") {
        const existing = err.body.dateId;
        console.log(`⚠ already in progress (${existing}); reusing`);
        allDates.push({
          pair: subject.pair,
          condition: subject.condition,
          cohort,
          subjectName: subject.subjectName,
          subjectAgentId: subject.agentId,
          recipientName: recipient.name,
          recipientAgentId: recipient.agentId,
          dateId: existing,
          opening,
          initiatedAt: new Date().toISOString(),
          note: "preexisting",
        });
      } else {
        console.log("✗", err.message);
      }
    }
  }

  // Persist manifest immediately
  const runPath = join(REPO_ROOT, "experiment-runs.local.json");
  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    experiment: "e1-tight",
    model: MODEL,
    maxTurns: MAX_TURNS,
    pairs: ["A", "B", "C"],
    conditions: ["rich", "medium", "thin"],
    dates: allDates,
  };
  writeFileSync(runPath, JSON.stringify(manifest, null, 2));
  step(`manifest written: ${runPath} (${allDates.length} dates)`);

  if (NO_DRIVE) {
    step("Skipping driver loop (--no-drive). Cron will progress dates over time.");
    return;
  }

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
      allDates.map((d) =>
        api("GET", `/api/public/dates/${d.dateId}`).then(
          (r) => r.date.status,
          () => "unknown",
        ),
      ),
    );
    const counts = {};
    for (const s of statuses) counts[s] = (counts[s] || 0) + 1;
    log(`  states: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}`);

    const allTerminal = statuses.every((s) => s === "completed" || s === "declined");
    if (allTerminal) {
      step(`All ${allDates.length} dates terminal — done after ${i} ticks.`);
      return;
    }
    if (i < MAX_TICKS) await new Promise((r) => setTimeout(r, TICK_INTERVAL_S * 1000));
  }
  step(`Reached tick budget (${MAX_TICKS}). Some dates may still be active.`);
})().catch((err) => {
  console.error("[run-e1 FATAL]", err);
  process.exit(1);
});
