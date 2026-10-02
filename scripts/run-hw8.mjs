#!/usr/bin/env node
/**
 * HW8 — Path A + Scale runner.
 *
 * Fires 27 dates concurrently across 3 pairs × 3 conditions × 3 trials,
 * with pair direction flipped for B and C so the dealbreaker-holder is
 * the recipient (and therefore the side whose persona slicing actually
 * affects the decision).
 *
 *   Pair A (control):    Hannah-fresh#i → Daniel-{rich|medium|thin}
 *   Pair B (smoking):    Wes-fresh#i    → Aisha-{rich|medium|thin}
 *   Pair C (intent):     Marcus-fresh#i → Sophie-{rich|medium|thin}
 *
 * Recipients are the 9 E1 subject agents (already seeded, framework
 * exp-e1-{condition}). Initiators are the 9 fresh test-bot agents from
 * scripts/seed-hw8-initiators.mjs.
 *
 * All 27 dates fire as fast as the API allows (Promise.allSettled for
 * concurrent POSTs), then the cron loop drains them. Per-tick metrics
 * captured: agentsProcessed, invitesProcessed, messagesSent,
 * verdictsSubmitted, totalErrors, plus elapsed-ms.
 *
 * Usage:
 *   node scripts/run-hw8.mjs
 *   node scripts/run-hw8.mjs --max-turns 4 --max-ticks 60
 *   node scripts/run-hw8.mjs --no-drive   # initiate only, let natural cron drain
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
const MAX_TICKS = Number(flag("--max-ticks", 80));
const NO_DRIVE = args.includes("--no-drive");
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_HEARTBEAT_SECRET;

if (!ANTHROPIC_KEY) {
  console.error("[hw8] ANTHROPIC_API_KEY not set");
  process.exit(2);
}
if (!CRON_SECRET) {
  console.error("[hw8] CRON_HEARTBEAT_SECRET not set");
  process.exit(2);
}

const initiatorsPath = join(REPO_ROOT, "hw8-initiators.local.json");
const recipientsPath = join(REPO_ROOT, "e1-tight-subjects.local.json");
if (!existsSync(initiatorsPath) || !existsSync(recipientsPath)) {
  console.error("[hw8] Missing local files. Run seed-hw8-initiators.mjs and seed-e1-tight.mjs first.");
  process.exit(2);
}
const initiators = JSON.parse(readFileSync(initiatorsPath, "utf8")).initiators;
const recipients = JSON.parse(readFileSync(recipientsPath, "utf8")).subjects;

// Inline persona snapshots (same as run-e1-tight.mjs to avoid auth round-trips).
const PERSONAS = {
  Hannah: {
    name: "Hannah", age: 29, genderIdentity: "Female", lookingFor: "Men",
    location: "Brookline, MA", relationshipIntent: "long-term",
    bio: "Pediatric OT. Big on long walks, used bookstores, and rainy-day reading. Dog person, allergic to cats.",
    interests: ["reading", "long walks", "thrift stores"],
    values: ["kindness", "reliability", "curiosity"],
    lifestyleHabits: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Sourdough at a café, then a slow museum.",
  },
  Daniel: {
    name: "Daniel", age: 29, genderIdentity: "Male", lookingFor: "Women",
    location: "Brookline, MA", relationshipIntent: "long-term",
    bio: "Pediatrics resident, weekend hiker, terrible at chess but trying. Coffee snob, working on it.",
    interests: ["hiking", "coffee", "reading"],
    values: ["kindness", "patience", "growth"],
    lifestyleHabits: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "never", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Trail head at sunrise, breakfast burritos after.",
  },
  Wes: {
    name: "Wes", age: 35, genderIdentity: "Male", lookingFor: "Women",
    location: "Allston, MA", relationshipIntent: "exploring",
    bio: "Bartender in Allston, work nights and weekends are music venues. Casual and present, not looking to settle.",
    interests: ["live music", "guitar", "nightlife"],
    values: ["fun", "freedom", "honesty"],
    lifestyleHabits: { sleepSchedule: "night-owl", socialEnergy: "high-energy", activityLevel: "sedentary", drinking: "heavy", smoking: "regular" },
    dealbreakers: [],
    idealFirstDate: "Late drinks somewhere loud, then a band if it's a good night.",
  },
  Aisha: {
    name: "Aisha", age: 38, genderIdentity: "Female", lookingFor: "Men",
    location: "Cambridge, MA", relationshipIntent: "long-term",
    bio: "Biotech founder, two cats, learning the cello at 38 because why not. Slow weekends, intense weeks.",
    interests: ["jazz", "reading", "cooking", "wine"],
    values: ["depth", "honesty", "humor"],
    lifestyleHabits: { sleepSchedule: "night-owl", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Late dinner, end at a jazz club for one drink.",
  },
  Marcus: {
    name: "Marcus", age: 20, genderIdentity: "Male", lookingFor: "Women",
    location: "Cambridge, MA", relationshipIntent: "exploring",
    bio: "Sophomore studying CS, ran cross-country in high school, learning to bake. Looking for someone who'll let me try out a new sourdough recipe on them.",
    interests: ["running", "baking", "video games"],
    values: ["honesty", "growth", "humor"],
    lifestyleHabits: { sleepSchedule: "night-owl", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking"],
    idealFirstDate: "Coffee on a porch, then a long walk.",
  },
  Sophie: {
    name: "Sophie", age: 23, genderIdentity: "Female", lookingFor: "Men",
    location: "Allston, MA", relationshipIntent: "serious-dating",
    bio: "First year teaching English in Boston public schools. Reading my way through the New York Times bestseller list. Ask me about my book club.",
    interests: ["reading", "podcasts", "live music"],
    values: ["thoughtfulness", "consistency", "warmth"],
    lifestyleHabits: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "rudeness"],
    idealFirstDate: "Bookstore browse, then a slow walk somewhere green.",
    preferenceAgeRange: { min: 22, max: 30 },
  },
};

// Build the 27 (initiator, recipient, condition) tuples.
// Each pair has 3 fresh initiators × 3 condition recipients = 9 dates.
function recipientFor(pair, condition) {
  // E1 subjects use subject.subjectName ∈ {Daniel, Aisha, Sophie}.
  const recipientName =
    pair === "A" ? "Daniel" : pair === "B" ? "Aisha" : "Sophie";
  return recipients.find(
    (s) => s.subjectName === recipientName && s.condition === condition,
  );
}
function initiatorPersonaName(pair) {
  return pair === "A" ? "Hannah" : pair === "B" ? "Wes" : "Marcus";
}

const PAIRS = ["A", "B", "C"];
const CONDITIONS = ["rich", "medium", "thin"];
const plan = [];
for (const pair of PAIRS) {
  const initPersonaName = initiatorPersonaName(pair);
  const initiatorsForPair = initiators.filter((i) => i.pair === pair);
  if (initiatorsForPair.length < 3) {
    console.error(`[hw8] need 3 initiators for pair ${pair}, found ${initiatorsForPair.length}`);
    process.exit(2);
  }
  for (const condition of CONDITIONS) {
    const rec = recipientFor(pair, condition);
    if (!rec) {
      console.error(`[hw8] missing recipient for pair=${pair} condition=${condition}`);
      process.exit(2);
    }
    for (let trial = 1; trial <= 3; trial++) {
      const initiator = initiatorsForPair[trial - 1];
      plan.push({
        pair,
        condition,
        trial,
        initiatorPersonaName: initPersonaName,
        initiatorAgentId: initiator.agentId,
        initiatorApiKey: initiator.apiKey,
        recipientPersonaName: rec.subjectName,
        recipientAgentId: rec.agentId,
      });
    }
  }
}
console.log(`[hw8] plan: ${plan.length} dates`);

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const step = (msg) => console.log(`\n→ ${msg}`);

async function api(method, path, { body, headers = {} } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const elapsed = Date.now() - t0;
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(`${method} ${path} → HTTP ${res.status} ${JSON.stringify(json)}`);
    err.body = json;
    err.status = res.status;
    err.elapsed = elapsed;
    throw err;
  }
  return { json, elapsed };
}

async function asAgent(apiKey, method, path, body) {
  return api(method, path, { body, headers: { Authorization: `Bearer ${apiKey}` } });
}

async function cron(limit = 10) {
  return api("GET", `/api/cron-heartbeat?limit=${limit}`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
}

async function claude(systemPrompt, userPrompt, maxTokens = 200, model = HAIKU_MODEL) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system: systemPrompt,
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

async function fireOne(p) {
  const initPersona = PERSONAS[p.initiatorPersonaName];
  const recPersona = PERSONAS[p.recipientPersonaName];
  const sys = `You are ${initPersona.name}'s dating agent. Compose a 1–2 sentence opening message to ${recPersona.name}. Reference one specific thing from their persona. Output the raw message only — no quotes, no "Name:" prefix.

YOUR HUMAN'S PERSONA:
${JSON.stringify(initPersona, null, 2)}

THEIR PERSONA:
${JSON.stringify(recPersona, null, 2)}`;
  const opening = await claude(sys, "Write the opening message now.", 200, HAIKU_MODEL);
  const cohort = `hw8-${p.pair}-${p.condition}-trial${p.trial}`;
  const initRes = await asAgent(p.initiatorApiKey, "POST", "/api/dates", {
    recipientAgentId: p.recipientAgentId,
    openingMessage: opening,
    maxTurns: MAX_TURNS,
    experimentCohort: cohort,
    subjectModel: HAIKU_MODEL,
  });
  return { dateId: initRes.json.date.id, cohort, opening };
}

(async () => {
  const t0 = Date.now();
  log("base URL:", BASE_URL);
  log(`firing ${plan.length} dates concurrently…`);

  // Concurrent fire
  const fireResults = await Promise.allSettled(
    plan.map((p) => fireOne(p).then(
      (r) => ({ ok: true, p, ...r }),
      (err) => ({ ok: false, p, error: err.message, errBody: err.body, elapsed: err.elapsed }),
    )),
  );

  const dates = [];
  let fireErrors = 0;
  for (const r of fireResults) {
    if (r.status === "fulfilled" && r.value.ok) {
      dates.push({
        ...r.value.p,
        dateId: r.value.dateId,
        cohort: r.value.cohort,
        opening: r.value.opening,
        firedAt: new Date().toISOString(),
      });
    } else {
      fireErrors += 1;
      const v = r.status === "fulfilled" ? r.value : { error: r.reason?.message };
      log(`  ✗ pair=${v.p?.pair ?? "?"} cond=${v.p?.condition ?? "?"} trial=${v.p?.trial ?? "?"}: ${v.error}`);
      if (v.errBody?.error === "date_already_in_progress") {
        const dateId = v.errBody.dateId;
        const cohort = `hw8-${v.p.pair}-${v.p.condition}-trial${v.p.trial}`;
        dates.push({ ...v.p, dateId, cohort, opening: null, firedAt: new Date().toISOString(), note: "preexisting" });
      }
    }
  }
  const fireElapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  log(`fired in ${fireElapsedSec}s. ${dates.length} dates active, ${fireErrors} errors`);

  const runPath = join(REPO_ROOT, "hw8-runs.local.json");
  let manifest = {};
  if (existsSync(runPath)) {
    try { manifest = JSON.parse(readFileSync(runPath, "utf8")); } catch {}
  }
  manifest.run = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    experiment: "hw8",
    pairs: PAIRS,
    conditions: CONDITIONS,
    trialsPerCell: 3,
    totalDates: dates.length,
    fireErrors,
    fireElapsedSec: Number(fireElapsedSec),
    maxTurns: MAX_TURNS,
  };
  manifest.dates = dates;
  manifest.tickMetrics = [];
  writeFileSync(runPath, JSON.stringify(manifest, null, 2));
  step(`manifest written: ${runPath} (${dates.length} dates)`);

  if (NO_DRIVE) {
    step("Skipping driver loop (--no-drive). Cron will drain over time.");
    return;
  }

  step(`Driving cron — up to ${MAX_TICKS} ticks, ${TICK_INTERVAL_S}s between ticks…`);
  const tickMetrics = [];
  for (let i = 1; i <= MAX_TICKS; i++) {
    const tickT0 = Date.now();
    let totals = null;
    let errored = false;
    try {
      const r = await cron(10);
      totals = r.json.totals;
    } catch (err) {
      errored = true;
      log(`  tick ${i}: cron error: ${err.message}`);
    }
    const tickElapsed = Date.now() - tickT0;

    // Status check
    const statusResults = await Promise.allSettled(
      dates.map((d) =>
        api("GET", `/api/public/dates/${d.dateId}`).then((r) => r.json.date.status, () => "unknown"),
      ),
    );
    const counts = {};
    for (const r of statusResults) {
      const s = r.status === "fulfilled" ? r.value : "error";
      counts[s] = (counts[s] || 0) + 1;
    }

    const metric = {
      tick: i,
      ts: new Date().toISOString(),
      cronElapsedMs: tickElapsed,
      totals: totals ?? null,
      errored,
      statusCounts: counts,
    };
    tickMetrics.push(metric);
    process.stdout.write(`  tick ${i}/${MAX_TICKS} (${tickElapsed}ms cron) — `);
    if (totals) {
      process.stdout.write(`${totals.agentsProcessed}a ${totals.invitesProcessed}inv ${totals.messagesSent}msg ${totals.verdictsSubmitted}v ${totals.totalErrors}err`);
    } else {
      process.stdout.write("CRON ERROR");
    }
    process.stdout.write(`  | states: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}\n`);

    if (statusResults.every((r) => r.status === "fulfilled" && (r.value === "completed" || r.value === "declined"))) {
      step(`All ${dates.length} dates terminal — done after ${i} ticks (${(((Date.now() - t0) / 1000)).toFixed(1)}s total).`);
      manifest.tickMetrics = tickMetrics;
      manifest.run.totalElapsedSec = Number(((Date.now() - t0) / 1000).toFixed(1));
      manifest.run.ticksToTerminal = i;
      writeFileSync(runPath, JSON.stringify(manifest, null, 2));
      return;
    }
    if (i < MAX_TICKS) await new Promise((r) => setTimeout(r, TICK_INTERVAL_S * 1000));
  }
  step(`Reached tick budget (${MAX_TICKS}). Some dates may still be active.`);
  manifest.tickMetrics = tickMetrics;
  manifest.run.totalElapsedSec = Number(((Date.now() - t0) / 1000).toFixed(1));
  writeFileSync(runPath, JSON.stringify(manifest, null, 2));
})().catch((err) => {
  console.error("[hw8 FATAL]", err);
  process.exit(1);
});
