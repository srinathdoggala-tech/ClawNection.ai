#!/usr/bin/env node
/**
 * E1 (persona-richness ablation) experiment driver.
 *
 * Reads the 3 subject agents from experiment-subjects.local.json.
 * For each subject (rich / medium / thin), picks N test agents that match
 * the subject's persona preferences (heterosexual, age range), composes an
 * opening message via Claude, and POSTs an invite tagged with
 * experimentCohort = "e1-{condition}" and subjectModel = the LLM driving
 * the agent (defaults to claude-haiku-4-5).
 *
 * Then polls /api/cron-heartbeat enough times to walk every date through
 * accept → conversation → both verdicts. The 5-minute GitHub Actions cron
 * keeps things moving in the background; this script just speeds it up.
 *
 * Writes a manifest of all the date IDs to experiment-runs.local.json
 * for analyze-experiment.mjs.
 *
 * Usage:
 *   node scripts/run-experiment.mjs                  # 10 dates per condition (30 total)
 *   node scripts/run-experiment.mjs --dates-per-condition 3  # smaller batch for smoke testing
 *   node scripts/run-experiment.mjs --max-turns 4    # shorter conversations
 *   node scripts/run-experiment.mjs --no-drive       # initiate dates only, let cron drive them
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

const DATES_PER_CONDITION = Number(flag("--dates-per-condition", 10));
const MAX_TURNS = Number(flag("--max-turns", 4));
const NO_DRIVE = args.includes("--no-drive");
const TICK_INTERVAL_S = Number(flag("--tick-interval", 8));
const MAX_TICKS = Number(flag("--max-ticks", DATES_PER_CONDITION * 5 + 4));
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_HEARTBEAT_SECRET;

if (!ANTHROPIC_KEY) {
  console.error("[exp] ANTHROPIC_API_KEY not set in env or .env.local — needed to compose opening messages.");
  process.exit(2);
}
if (!CRON_SECRET) {
  console.error("[exp] CRON_HEARTBEAT_SECRET not set — needed to fire /api/cron-heartbeat between turns.");
  process.exit(2);
}

const subjectsPath = join(REPO_ROOT, "experiment-subjects.local.json");
if (!existsSync(subjectsPath)) {
  console.error(`[exp] ${subjectsPath} not found. Run scripts/seed-experiment-subjects.mjs first.`);
  process.exit(2);
}
const subjectsFile = JSON.parse(readFileSync(subjectsPath, "utf8"));
const subjects = subjectsFile.subjects;

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
  log(`subjects: ${subjects.length} (${subjects.map((s) => s.condition).join(", ")})`);
  log(`dates per condition: ${DATES_PER_CONDITION}`);
  log(`max turns: ${MAX_TURNS}`);

  const allDates = [];

  for (const subject of subjects) {
    step(`Subject: ${subject.condition} (${subject.framework}) — ${subject.agentId}`);
    // Read subject's persona
    const me = await asAgent(subject.apiKey, "GET", "/api/agent/me");
    // We want candidates whose `lookingFor` matches MY gender — i.e. people
    // who are interested in someone like me. The schema uses "Men" / "Women"
    // (plural) for lookingFor values, mapped from the gender identity.
    const myGender = me.persona.genderIdentity;
    const candidateLookingFor =
      myGender === "Male" ? "Men" : myGender === "Female" ? "Women" : "";
    const search = await asAgent(
      subject.apiKey,
      "GET",
      `/api/personas?limit=50&minAge=${me.persona.preferenceAgeRange?.min ?? 18}&maxAge=${
        me.persona.preferenceAgeRange?.max ?? 99
      }&lookingFor=${encodeURIComponent(candidateLookingFor)}`,
    );
    // Filter to test-bot agents only — clean experimental population
    const candidates = (search.candidates ?? [])
      .flatMap((c) => c.agents.filter((a) => a.framework === "test-bot").map((a) => ({ persona: c.persona, agent: a })))
      .filter((c) => c.persona.id !== me.persona.id);

    if (candidates.length < DATES_PER_CONDITION) {
      log(`  ⚠ only ${candidates.length} compatible test-bot candidates; experiment will use what's available`);
    }

    const targets = candidates.slice(0, DATES_PER_CONDITION);
    log(`  picked ${targets.length} candidates: ${targets.map((t) => t.persona.name).join(", ")}`);

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      // Compose opening with full persona context (fair across conditions for *initiation*)
      const sys = `You are ${me.persona.name}'s dating agent. Compose a 1–2 sentence opening message to ${t.persona.name}. Reference one specific thing from their persona. Output the raw message only.

YOUR PERSONA:
${JSON.stringify(me.persona, null, 2)}

THEIR PERSONA:
${JSON.stringify(t.persona, null, 2)}`;
      let opening;
      try {
        opening = await claude(sys, "Write the opening message now.", 200);
      } catch (err) {
        log(`    ✗ opening for ${t.persona.name}: ${err.message}`);
        continue;
      }
      const cohort = `e1-${subject.condition}`;
      try {
        const init = await asAgent(subject.apiKey, "POST", "/api/dates", {
          recipientAgentId: t.agent.id,
          openingMessage: opening,
          maxTurns: MAX_TURNS,
          experimentCohort: cohort,
          subjectModel: MODEL,
        });
        allDates.push({
          condition: subject.condition,
          subjectAgentId: subject.agentId,
          subjectFramework: subject.framework,
          recipientAgentId: t.agent.id,
          recipientPersonaName: t.persona.name,
          dateId: init.date.id,
          cohort,
          initiatedAt: new Date().toISOString(),
        });
        process.stdout.write(`    ${i + 1}/${targets.length} ${t.persona.name} → ${init.date.id} ✓\n`);
      } catch (err) {
        if (err.body?.error === "date_already_in_progress") {
          log(`    ⚠ ${t.persona.name}: already in progress (${err.body.dateId}); reusing`);
          allDates.push({
            condition: subject.condition,
            subjectAgentId: subject.agentId,
            subjectFramework: subject.framework,
            recipientAgentId: t.agent.id,
            recipientPersonaName: t.persona.name,
            dateId: err.body.dateId,
            cohort,
            initiatedAt: new Date().toISOString(),
            note: "preexisting",
          });
        } else {
          log(`    ✗ ${t.persona.name}: ${err.message}`);
        }
      }
    }
  }

  // Write manifest immediately so we don't lose data if the cron loop fails
  const runPath = join(REPO_ROOT, "experiment-runs.local.json");
  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    model: MODEL,
    maxTurns: MAX_TURNS,
    datesPerCondition: DATES_PER_CONDITION,
    dates: allDates,
  };
  writeFileSync(runPath, JSON.stringify(manifest, null, 2));
  step(`manifest written: ${runPath} (${allDates.length} dates)`);

  if (NO_DRIVE) {
    step("Skipping driver loop (--no-drive). Cron will progress dates over time.");
    return;
  }

  step(`Driving cron — ${MAX_TICKS} ticks, ${TICK_INTERVAL_S}s between ticks…`);
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

    // Status check
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

    const allDone = statuses.every((s) => s === "completed" || s === "declined");
    if (allDone) {
      step(`All ${allDates.length} dates terminal — done after ${i} ticks.`);
      return;
    }
    if (i < MAX_TICKS) await new Promise((r) => setTimeout(r, TICK_INTERVAL_S * 1000));
  }
  step(`Reached tick budget (${MAX_TICKS}). Some dates may still be active.`);
  log(`Run scripts/analyze-experiment.mjs once everything terminal.`);
})().catch((err) => {
  console.error("[exp FATAL]", err);
  process.exit(1);
});
