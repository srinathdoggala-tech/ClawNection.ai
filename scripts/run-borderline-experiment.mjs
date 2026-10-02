#!/usr/bin/env node
/**
 * Verdict-redesign experiment: do the new soft-signal fields + multi-
 * dimensional verdict prompt produce a realistic outcome distribution?
 *
 * Fires 10 dates: each of 5 borderline pairs in BOTH directions (woman
 * initiates man, then man initiates woman) so we get reciprocal-side
 * data. Conversation runs the full 4-turn course; verdict step now uses
 * the multi-dimensional discriminating prompt.
 *
 * Target outcome distribution after the fix:
 *   - some "decline at invite" (filter still works)
 *   - some "accepted but verdict no" (the missing third outcome)
 *   - some "mutual match" (compatible enough on all 7 dimensions)
 *
 * If we still see 100% mutual match among completed dates, the prompt
 * change didn't take.
 *
 * Usage:
 *   node scripts/run-borderline-experiment.mjs
 *   node scripts/run-borderline-experiment.mjs --max-turns 4 --max-ticks 60
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
const MODEL = "claude-haiku-4-5-20251001";

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_HEARTBEAT_SECRET;
if (!ANTHROPIC_KEY) {
  console.error("[borderline] ANTHROPIC_API_KEY not set");
  process.exit(2);
}
if (!CRON_SECRET) {
  console.error("[borderline] CRON_HEARTBEAT_SECRET not set");
  process.exit(2);
}

const credsPath = join(REPO_ROOT, "borderline-pairs.local.json");
if (!existsSync(credsPath)) {
  console.error("[borderline] missing borderline-pairs.local.json — run seed-borderline-pairs.mjs first");
  process.exit(2);
}
const pairs = JSON.parse(readFileSync(credsPath, "utf8")).pairs;

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
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.content?.find?.((b) => b.type === "text")?.text?.trim?.() || "";
}

async function fetchPersonaForAgent(agentApiKey) {
  const me = await asAgent(agentApiKey, "GET", "/api/agent/me");
  return me.persona;
}

async function fireOne({ initiatorApiKey, initiatorName, recipientAgentId, recipientName, cohort, recipientPersona }) {
  const myPersona = await fetchPersonaForAgent(initiatorApiKey);
  const sys = `You are ${initiatorName}'s dating agent. Compose a 1–2 sentence opening message to ${recipientName}. Reference one specific thing from their persona. Output the raw message only — no quotes, no "Name:" prefix.

YOUR HUMAN'S PERSONA:
${JSON.stringify(myPersona, null, 2)}

THEIR PERSONA:
${JSON.stringify(recipientPersona, null, 2)}`;
  const opening = await claude(sys, "Write the opening message now.", 200);
  const init = await asAgent(initiatorApiKey, "POST", "/api/dates", {
    recipientAgentId,
    openingMessage: opening,
    maxTurns: MAX_TURNS,
    experimentCohort: cohort,
    subjectModel: MODEL,
  });
  return { dateId: init.date.id, opening };
}

(async () => {
  const t0 = Date.now();
  log("base URL:", BASE_URL);
  log(`firing ${pairs.length * 2} dates (5 pairs × 2 directions)…`);

  // Fetch personas once for both sides of each pair (recipient side is
  // public via /api/agent/me with their api key)
  const personas = {};
  for (const p of pairs) {
    personas[p.woman.agentId] = await fetchPersonaForAgent(p.woman.apiKey);
    personas[p.man.agentId] = await fetchPersonaForAgent(p.man.apiKey);
  }

  const dates = [];
  const fireResults = await Promise.allSettled(
    pairs.flatMap((p) => [
      // woman → man
      fireOne({
        initiatorApiKey: p.woman.apiKey,
        initiatorName: p.woman.personaName,
        recipientAgentId: p.man.agentId,
        recipientName: p.man.personaName,
        cohort: `borderline-${p.label.split(" ")[0]}-WtoM`,
        recipientPersona: personas[p.man.agentId],
      }).then(
        (r) => ({ ok: true, pair: p, direction: "WtoM", ...r }),
        (err) => ({ ok: false, pair: p, direction: "WtoM", error: err.message, errBody: err.body }),
      ),
      // man → woman
      fireOne({
        initiatorApiKey: p.man.apiKey,
        initiatorName: p.man.personaName,
        recipientAgentId: p.woman.agentId,
        recipientName: p.woman.personaName,
        cohort: `borderline-${p.label.split(" ")[0]}-MtoW`,
        recipientPersona: personas[p.woman.agentId],
      }).then(
        (r) => ({ ok: true, pair: p, direction: "MtoW", ...r }),
        (err) => ({ ok: false, pair: p, direction: "MtoW", error: err.message, errBody: err.body }),
      ),
    ]),
  );

  let fireErrors = 0;
  for (const r of fireResults) {
    if (r.status === "fulfilled" && r.value.ok) {
      const { pair, direction, dateId, opening } = r.value;
      dates.push({
        label: pair.label,
        direction,
        cohort: `borderline-${pair.label.split(" ")[0]}-${direction}`,
        initiator: direction === "WtoM" ? pair.woman.personaName : pair.man.personaName,
        recipient: direction === "WtoM" ? pair.man.personaName : pair.woman.personaName,
        dateId,
        opening,
        firedAt: new Date().toISOString(),
      });
    } else {
      fireErrors += 1;
      const v = r.status === "fulfilled" ? r.value : { error: r.reason?.message };
      log(`  ✗ ${v.pair?.label} ${v.direction}: ${v.error}`);
      if (v.errBody?.error === "date_already_in_progress") {
        const dateId = v.errBody.dateId;
        dates.push({
          label: v.pair.label,
          direction: v.direction,
          cohort: `borderline-${v.pair.label.split(" ")[0]}-${v.direction}`,
          dateId,
          opening: null,
          firedAt: new Date().toISOString(),
          note: "preexisting",
        });
      }
    }
  }
  log(`fired ${dates.length} dates in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${fireErrors} errors`);

  const runPath = join(REPO_ROOT, "borderline-runs.local.json");
  let manifest = {};
  if (existsSync(runPath)) {
    try { manifest = JSON.parse(readFileSync(runPath, "utf8")); } catch {}
  }
  manifest.run = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    experiment: "borderline",
    totalDates: dates.length,
    fireErrors,
    maxTurns: MAX_TURNS,
  };
  manifest.dates = dates;
  writeFileSync(runPath, JSON.stringify(manifest, null, 2));
  step(`manifest: ${runPath} (${dates.length} dates)`);

  step(`Driving cron — up to ${MAX_TICKS} ticks @ ${TICK_INTERVAL_S}s…`);
  for (let i = 1; i <= MAX_TICKS; i++) {
    const tickT0 = Date.now();
    let totals = null;
    try {
      const r = await cron(10);
      totals = r.totals;
    } catch (err) {
      process.stdout.write(`  tick ${i}: cron error: ${err.message}\n`);
    }
    const tickElapsed = Date.now() - tickT0;
    const statuses = await Promise.all(
      dates.map((d) =>
        api("GET", `/api/public/dates/${d.dateId}`).then((r) => r.date.status, () => "unknown"),
      ),
    );
    const counts = {};
    for (const s of statuses) counts[s] = (counts[s] || 0) + 1;
    process.stdout.write(`  tick ${i}/${MAX_TICKS} (${tickElapsed}ms) — `);
    if (totals) {
      process.stdout.write(`${totals.agentsProcessed}a ${totals.invitesProcessed}inv ${totals.messagesSent}msg ${totals.verdictsSubmitted}v ${totals.totalErrors}err`);
    } else {
      process.stdout.write("CRON ERROR");
    }
    process.stdout.write(`  | states: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}\n`);
    if (statuses.every((s) => s === "completed" || s === "declined")) {
      step(`All ${dates.length} dates terminal — done after ${i} ticks (${(((Date.now() - t0) / 1000)).toFixed(1)}s total).`);
      manifest.run.totalElapsedSec = Number(((Date.now() - t0) / 1000).toFixed(1));
      manifest.run.ticksToTerminal = i;
      writeFileSync(runPath, JSON.stringify(manifest, null, 2));
      return;
    }
    if (i < MAX_TICKS) await new Promise((r) => setTimeout(r, TICK_INTERVAL_S * 1000));
  }
  step(`Reached tick budget (${MAX_TICKS}). Some dates may still be active.`);
})().catch((err) => {
  console.error("[borderline FATAL]", err);
  process.exit(1);
});
