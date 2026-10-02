#!/usr/bin/env node
/**
 * scripts/demo-burst-date.mjs
 *
 * Fast-fire ONE date for the HW10 demo video. Uses Demetri's real bio
 * + demographics, paired with Aisha (the most compatible test-bot match:
 * both Boston-metro, both night-owl, both intellectually serious, both
 * long-term intent, ages 38/39 — should reliably mutual-match).
 *
 * Wall-clock to drain a complete 4-turn date with verdicts:
 *   ~30-50 seconds (vs ~10-15 min under the natural 2-min cron)
 *
 * The script:
 *   1. Registers Demetri's persona + agent (idempotent — caches creds
 *      to demo-demetri.local.json on first run, reuses thereafter)
 *   2. Cleans up any stale Demetri↔Aisha date so re-runs work
 *   3. Composes Demetri's opening message via Claude
 *   4. POSTs /api/dates → invite to Aisha
 *   5. Hammers /api/cron-heartbeat back-to-back (no sleep) until both
 *      verdicts submit and the date is terminal
 *   6. Prints both verdicts + MUTUAL MATCH banner if both said yes
 *
 * Recording flow (your side):
 *   1. Open https://clawnection.com/watch?demo=1 in browser
 *      (?demo=1 drops poll interval from 4s to 1s — messages stream)
 *   2. Cmd+Shift+5 → Record selected portion → drag around browser window
 *   3. Run: node scripts/demo-burst-date.mjs
 *   4. Watch the conversation appear in the browser
 *   5. Stop recording when the MUTUAL MATCH badge appears
 *   6. QuickTime → Edit → Trim to fit 30s
 *
 * Re-recording: the script is idempotent. Cleans the previous demo date
 * automatically. Just re-run.
 *
 * Usage:
 *   node scripts/demo-burst-date.mjs
 *   node scripts/demo-burst-date.mjs --max-turns 4 --max-ticks 30
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
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
const MAX_TICKS = flagN("--max-ticks", 30);
const MODEL = "claude-haiku-4-5-20251001";

const BASE_URL = process.env.CLAWNECTION_BASE_URL || "https://clawnection.com";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_HEARTBEAT_SECRET;

if (!ANTHROPIC_KEY || !CRON_SECRET) {
  console.error("[demo] missing env keys (ANTHROPIC_API_KEY or CRON_HEARTBEAT_SECRET)");
  console.error("[demo] both should be in .env.local");
  process.exit(2);
}
// CLOUDFLARE_API_TOKEN is required for the wrangler-based D1 calls that
// pin agent priority + clean up stale dates. Without it, the script
// silently falls back to slow-mode (~80s drain) which won't fit a 30-sec
// video. Fail fast with a clear instruction.
if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error("[demo] missing CLOUDFLARE_API_TOKEN");
  console.error("[demo] add this line to .env.local then re-run:");
  console.error("[demo]   CLOUDFLARE_API_TOKEN=cfat_<your-token>");
  console.error("[demo] without it, the script can't pin agent priority and the date will sit pending forever");
  process.exit(2);
}

// ============================================================
// Demetri's persona — the user's real info
// ============================================================
const DEMETRI = {
  name: "Demetri",
  age: 39,
  gender: "Male",
  lookingFor: "Women",
  location: "Boston, MA",
  occupation: { type: "school", place: "Harvard/MIT" },
  intent: "long-term",
  bio: "Renewable energy developer working in Boston. Love my friends and family and spending time outdoors. At the beach or by a lake are my favorite! Finance by day, philosophy by night. Yoga on the weekends.",
  interests: ["music", "food", "travel", "museums"],
  values: ["honesty", "spontaneity", "depth"],
  communicationStyle: "balanced",
  lifestyle: {
    sleepSchedule: "night-owl",
    socialEnergy: "balanced",
    activityLevel: "active",
    drinking: "social",
    smoking: "never",
  },
  dealbreakers: ["rudeness"],
  idealFirstDate: "Late dinner somewhere with character, then a long walk by the water.",
  prefAge: [32, 46],
  notes: "Looking for someone curious, present, and thoughtful — bonus for night-owl energy and a spontaneous streak.",
};

// ============================================================
// Aisha — the test-bot match (known from prior seeding)
// ============================================================
// Aisha: 38F, biotech founder, night-owl, long-term, jazz/reading/cooking/wine,
// preferenceAgeRange 34-46 (Demetri 39 ✓), dealbreakers smoking + dishonesty.
// Her plain test-bot agent ID and her persona data inline so we can compose
// Demetri's opening without an extra round-trip.
const AISHA_AGENT_ID = "agt_g5BfsNNzAIspOb59";
const AISHA_PERSONA = {
  name: "Aisha", age: 38, genderIdentity: "Female", lookingFor: "Men",
  location: "Cambridge, MA", relationshipIntent: "long-term",
  bio: "Biotech founder, two cats, learning the cello at 38 because why not. Slow weekends, intense weeks.",
  interests: ["jazz", "reading", "cooking", "wine"],
  values: ["depth", "honesty", "humor"],
  lifestyleHabits: { sleepSchedule: "night-owl", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
  dealbreakers: ["smoking", "dishonesty"],
  idealFirstDate: "Late dinner, end at a jazz club for one drink.",
};

// ============================================================
// API helpers
// ============================================================

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

function execD1(sql) {
  const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  const tmp = join(REPO_ROOT, ".demo-tmp.sql");
  writeFileSync(tmp, sql);
  try {
    execFileSync(
      wrangler,
      ["d1", "execute", "clawnection-agentic-db", "--remote", "--file", tmp],
      { stdio: "pipe", env: process.env, cwd: REPO_ROOT },
    );
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// ============================================================
// Step 1 — register Demetri (idempotent, cached)
// ============================================================

async function registerDemetri() {
  const credsPath = join(REPO_ROOT, "demo-demetri.local.json");
  if (existsSync(credsPath)) {
    const existing = JSON.parse(readFileSync(credsPath, "utf8"));
    console.log(`[demo] reusing Demetri's existing agent: ${existing.agentId}`);
    return existing;
  }

  const body = {
    displayName: `${DEMETRI.name}'s agent`,
    operator: "demetri-demo",
    framework: "external",
    persona: {
      name: DEMETRI.name,
      age: DEMETRI.age,
      genderIdentity: DEMETRI.gender,
      lookingFor: DEMETRI.lookingFor,
      location: DEMETRI.location,
      occupation: DEMETRI.occupation,
      relationshipIntent: DEMETRI.intent,
      bio: DEMETRI.bio,
      interests: DEMETRI.interests,
      values: DEMETRI.values,
      communicationStyle: DEMETRI.communicationStyle,
      lifestyleHabits: DEMETRI.lifestyle,
      dealbreakers: DEMETRI.dealbreakers,
      idealFirstDate: DEMETRI.idealFirstDate,
      preferenceAgeRange: { min: DEMETRI.prefAge[0], max: DEMETRI.prefAge[1] },
      preferenceNotes: DEMETRI.notes,
      agentType: "external-mock",
    },
  };
  console.log(`[demo] registering Demetri's persona + agent…`);
  const data = await api("POST", "/api/agent/register", { body });
  const cred = {
    name: DEMETRI.name,
    agentId: data.agent.id,
    apiKey: data.apiKey,
    personaId: data.persona.id,
  };
  writeFileSync(credsPath, JSON.stringify(cred, null, 2));
  console.log(`[demo] ✓ Demetri registered: ${cred.agentId}`);

  // Add credentials to test_agent_credentials so the cron handler can
  // act on Demetri's behalf during the burst.
  const id = cred.agentId.replace(/'/g, "''");
  const key = cred.apiKey.replace(/'/g, "''");
  execD1(
    `INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES ('${id}', '${key}', 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1;`,
  );
  console.log(`[demo] ✓ credentials uploaded — cron can now drive Demetri`);
  return cred;
}

// ============================================================
// Step 2 — clean up any stale date with Aisha
// ============================================================

function cleanupStaleDate(demetriCred) {
  const a = demetriCred.agentId.replace(/'/g, "''");
  const b = AISHA_AGENT_ID;
  const where = `(initiator_agent_id = '${a}' AND recipient_agent_id = '${b}') OR (initiator_agent_id = '${b}' AND recipient_agent_id = '${a}')`;
  try {
    execD1(`DELETE FROM date_messages WHERE date_id IN (SELECT id FROM virtual_dates WHERE ${where}); DELETE FROM verdicts WHERE date_id IN (SELECT id FROM virtual_dates WHERE ${where}); DELETE FROM virtual_dates WHERE ${where};`);
    console.log(`[demo] ✓ cleaned up any stale Demetri↔Aisha dates`);
  } catch (err) {
    console.warn(`[demo] cleanup warning (proceeding anyway): ${err.message}`);
  }
}

// ============================================================
// Step 3 — fire the date
// ============================================================

async function fireDate(demetriCred) {
  const me = await asAgent(demetriCred.apiKey, "GET", "/api/agent/me");
  const sys = `You are ${me.persona.name}'s dating agent. Compose a 1–2 sentence opening message to ${AISHA_PERSONA.name}. Reference one specific thing from their persona. Output the raw message only — no quotes, no "Name:" prefix.

YOUR HUMAN'S PERSONA:
${JSON.stringify(me.persona, null, 2)}

THEIR PERSONA:
${JSON.stringify(AISHA_PERSONA, null, 2)}`;
  const opening = await claude(sys, "Write the opening message now.", 200);
  console.log(`\n[demo] opening message:\n  "${opening}"\n`);

  const init = await asAgent(demetriCred.apiKey, "POST", "/api/dates", {
    recipientAgentId: AISHA_AGENT_ID,
    openingMessage: opening,
    maxTurns: MAX_TURNS,
    experimentCohort: "demo-burst",
    subjectModel: MODEL,
  });
  console.log(`[demo] ✓ date fired: ${init.date.id}`);
  return init.date.id;
}

// ============================================================
// Step 4 — drain via back-to-back cron ticks (no sleep)
// ============================================================

async function drainDate(dateId, demetriCred) {
  console.log(`\n[demo] hammering cron — watch the browser for the conversation streaming in\n`);
  // Pin Demetri + Aisha to the top of the cron queue every tick by
  // resetting their last_tick_at on test_agent_credentials. With limit=2,
  // every cron call processes ONLY these two agents — no rotation through
  // the rest of the fleet. Cuts wall-clock from ~82s (with limit=10 +
  // natural rotation) to ~30s.
  const demetriId = demetriCred.agentId.replace(/'/g, "''");
  const pinSql = `UPDATE test_agent_credentials SET last_tick_at = NULL WHERE agent_id IN ('${demetriId}', '${AISHA_AGENT_ID}');`;
  for (let i = 1; i <= MAX_TICKS; i++) {
    // Force Demetri + Aisha to the front of the queue
    try { execD1(pinSql); } catch {}
    let totals = null;
    try {
      const r = await cron(2);  // limit=2 — only our 2 agents get processed
      totals = r.totals;
    } catch (err) {
      console.log(`  tick ${i}: cron error: ${err.message}`);
    }
    let status = "unknown";
    let turnCount = 0;
    try {
      const r = await api("GET", `/api/public/dates/${dateId}`);
      status = r.date.status;
      turnCount = r.date.turnCount ?? 0;
    } catch {}
    process.stdout.write(`  tick ${String(i).padStart(2)}/${MAX_TICKS} `);
    if (totals) {
      process.stdout.write(`(${totals.invitesProcessed}inv ${totals.messagesSent}msg ${totals.verdictsSubmitted}v)`);
    } else {
      process.stdout.write(`(no cron data)`);
    }
    process.stdout.write(`  status=${status} turns=${turnCount}\n`);

    if (status === "completed" || status === "declined") {
      console.log(`\n[demo] ✓ terminal after ${i} ticks`);
      const r = await api("GET", `/api/public/dates/${dateId}`);
      const v1 = r.verdicts?.initiator;
      const v2 = r.verdicts?.recipient;
      if (v1 && v2) {
        const both = v1.wouldMeetIrl && v2.wouldMeetIrl;
        console.log(`\n  Demetri's verdict: ${v1.wouldMeetIrl ? "YES" : "NO"} (${v1.rating}/10)`);
        console.log(`  Aisha's verdict:   ${v2.wouldMeetIrl ? "YES" : "NO"} (${v2.rating}/10)`);
        console.log(`\n  ${both ? "★  M U T U A L   M A T C H  ★" : "no mutual match — re-run to try again"}`);
      }
      return status;
    }
    // No sleep between ticks — burst as fast as the API allows
  }
  console.log(`\n[demo] reached tick budget (${MAX_TICKS}) without terminal status`);
}

// ============================================================
// Run
// ============================================================

const t0 = Date.now();
console.log(`[demo] base URL: ${BASE_URL}\n`);
const cred = await registerDemetri();
cleanupStaleDate(cred);
const dateId = await fireDate(cred);
console.log(`\n[demo] watch the date live:`);
console.log(`  ${BASE_URL}/dates/${dateId}?demo=1`);
console.log(`  ${BASE_URL}/watch?demo=1`);
await drainDate(dateId, cred);
console.log(`\n[demo] total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
