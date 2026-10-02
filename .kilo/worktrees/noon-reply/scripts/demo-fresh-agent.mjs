#!/usr/bin/env node
/**
 * HW6 demo — drive a freshly-onboarded agent end-to-end on stage.
 *
 * Designed to be run IN A SCREEN RECORDING right after the onboarding flow.
 * Takes a brand-new API key (the one /connect-agent shows to the user),
 * loads the persona, picks a compatible test agent from the platform's
 * directory, composes a Claude opening, runs the conversation to
 * completion, and prints a clean recommendation summary.
 *
 * Output is deliberately step-paced and narratable so a viewer can follow
 * what's happening in real time.
 *
 * Usage:
 *   node scripts/demo-fresh-agent.mjs --api-key cag_...
 *
 * Optional flags:
 *   --max-turns 4         shorter conversations (default 4)
 *   --tick-interval 8     seconds between cron firings (default 8)
 *   --max-ticks 14        cap on how many cron ticks before bail (default 14)
 *
 * Required env (from .env.local at repo root):
 *   ANTHROPIC_API_KEY     used to compose the new agent's turns
 *   CRON_HEARTBEAT_SECRET drives the test-bot replies via cron-heartbeat
 *
 * For the HW6 video, run this immediately after copying the API key from
 * /connect-agent. ~75 seconds of footage from start to mutual-match
 * recommendation.
 */

import { readFileSync } from "node:fs";
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

const API_KEY = flag("--api-key");
const MAX_TURNS = Number(flag("--max-turns", 4));
const TICK_INTERVAL_S = Number(flag("--tick-interval", 8));
const MAX_TICKS = Number(flag("--max-ticks", 14));

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_HEARTBEAT_SECRET;
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

if (!API_KEY || typeof API_KEY !== "string" || !API_KEY.startsWith("cag_")) {
  console.error("Usage: node scripts/demo-fresh-agent.mjs --api-key cag_...");
  console.error("Get a fresh key by completing the /connect-agent flow.");
  process.exit(2);
}
if (!ANTHROPIC_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(2);
}
if (!CRON_SECRET) {
  console.error("Missing CRON_HEARTBEAT_SECRET in .env.local");
  process.exit(2);
}

// ---- Pretty print helpers (designed for a screen recording) ----

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  rose: "\x1b[38;5;212m",
  gold: "\x1b[38;5;220m",
  green: "\x1b[38;5;120m",
  red: "\x1b[38;5;203m",
  blue: "\x1b[38;5;111m",
  muted: "\x1b[38;5;245m",
};

function rule(char = "─", width = 64) {
  return char.repeat(width);
}
function header(text) {
  console.log("");
  console.log(C.gold + C.bold + rule("═") + C.reset);
  console.log(C.gold + C.bold + "  " + text + C.reset);
  console.log(C.gold + C.bold + rule("═") + C.reset);
}
function stage(n, text) {
  console.log("");
  console.log(C.bold + C.blue + `→ STAGE ${n}: ${text}` + C.reset);
}
function ok(text) {
  console.log(`  ${C.green}✓${C.reset} ${text}`);
}
function info(text) {
  console.log(`  ${C.muted}${text}${C.reset}`);
}
function warn(text) {
  console.log(`  ${C.gold}⚠${C.reset}  ${text}`);
}
function fail(text) {
  console.log(`  ${C.red}✗${C.reset} ${text}`);
}
function pause(ms = 700) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- HTTP helpers ----

async function api(method, path, { body, key } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error(`${method} ${path} → HTTP ${res.status} ${JSON.stringify(json)}`);
    e.status = res.status;
    e.body = json;
    throw e;
  }
  return json;
}

async function cron(limit = 10) {
  return api("GET", `/api/cron-heartbeat?limit=${limit}`, { key: CRON_SECRET });
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
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.content?.find?.((b) => b.type === "text")?.text?.trim?.() || "";
}

function tryParseJson(text) {
  try { return JSON.parse(text.replace(/```json\s*|\s*```/g, "").trim()); } catch { return null; }
}

// ---- The demo ----

(async () => {
  header("CLAWNECTION — agent activation");

  // Stage 1: load self
  stage(1, "Loading your profile from the platform…");
  await pause(400);
  const me = await api("GET", "/api/agent/me", { key: API_KEY });
  ok(`agent ${C.bold}${me.agent.id}${C.reset} authenticated`);
  ok(
    `persona: ${C.bold}${me.persona.name}${C.reset}, ${me.persona.age} ${me.persona.genderIdentity}, ${me.persona.location}, looking for ${me.persona.lookingFor}`,
  );
  if (me.persona.interests?.length) {
    info(`interests: ${me.persona.interests.slice(0, 5).join(", ")}`);
  }
  if (me.persona.values?.length) {
    info(`values:    ${me.persona.values.slice(0, 4).join(", ")}`);
  }
  await pause(900);

  // Stage 2: search candidates
  stage(2, "Searching the platform for compatible agents…");
  await pause(400);
  const myGender = me.persona.genderIdentity;
  const candidateLookingFor =
    myGender === "Male" ? "Men" : myGender === "Female" ? "Women" : "";
  const minAge = me.persona.preferenceAgeRange?.min ?? 18;
  const maxAge = me.persona.preferenceAgeRange?.max ?? 99;
  const search = await api(
    "GET",
    `/api/personas?limit=50&minAge=${minAge}&maxAge=${maxAge}&lookingFor=${encodeURIComponent(candidateLookingFor)}`,
    { key: API_KEY },
  );
  const candidates = (search.candidates ?? [])
    .flatMap((c) =>
      c.agents
        .filter((a) => a.framework === "test-bot")
        .map((a) => ({ persona: c.persona, agent: a })),
    )
    .filter((c) => c.persona.id !== me.persona.id);
  ok(`found ${C.bold}${candidates.length}${C.reset} compatible candidates in the test-agent population`);
  if (candidates.length === 0) {
    fail("no candidates available — try widening your age range");
    process.exit(1);
  }
  // Score candidates: shared interests
  const myInterests = new Set((me.persona.interests ?? []).map((s) => s.toLowerCase()));
  const scored = candidates
    .map((c) => {
      const overlap = (c.persona.interests ?? []).filter((i) =>
        myInterests.has(i.toLowerCase()),
      ).length;
      return { ...c, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap || Math.random() - 0.5);
  const target = scored[0];
  ok(
    `picked: ${C.bold}${target.persona.name}${C.reset}, ${target.persona.age}${myGender === "Male" ? "F" : "M"}, ${target.persona.location} — ${target.overlap > 0 ? `${target.overlap} shared interest${target.overlap === 1 ? "" : "s"}` : "best fit on age + intent"}`,
  );
  await pause(900);

  // Stage 3: compose opening + initiate
  stage(3, "Composing an opening message via Claude…");
  await pause(400);
  const openingSys = `You are ${me.persona.name}'s dating agent on a virtual dating platform. Compose a 1–2 sentence opening message to ${target.persona.name}. Reference one specific thing from their persona. Output the raw message only — no quotes, no "Name:" prefix.

YOUR HUMAN'S PERSONA:
${JSON.stringify(me.persona, null, 2)}

THEIR PERSONA:
${JSON.stringify(target.persona, null, 2)}`;
  const opening = await claude(openingSys, "Write the opening message now.", 200);
  ok(`opening: ${C.dim}"${opening.length > 100 ? opening.slice(0, 97) + "…" : opening}"${C.reset}`);
  await pause(400);

  console.log("");
  console.log(C.bold + "→ STAGE 4: Sending the invite…" + C.reset);
  let dateId;
  let resumed = false;
  try {
    const init = await api("POST", "/api/dates", {
      key: API_KEY,
      body: {
        recipientAgentId: target.agent.id,
        openingMessage: opening,
        maxTurns: MAX_TURNS,
      },
    });
    dateId = init.date.id;
    ok(`date created: ${C.bold}${dateId}${C.reset}`);
  } catch (err) {
    if (err.body?.error === "date_already_in_progress" && err.body?.dateId) {
      dateId = err.body.dateId;
      resumed = true;
      warn(`${target.persona.name} already has a date with you in progress — resuming ${dateId}`);
    } else {
      throw err;
    }
  }
  ok(`watch live:   ${C.blue}${BASE_URL}/dates/${dateId}?demo=1${C.reset}`);
  await pause(800);

  // Stage 5: drive cron + take turns
  stage(5, `Letting the agents converse — ${MAX_TURNS} turns, real Claude calls…`);
  console.log(C.muted + "  (each tick: cron wakes test agents; the script takes your turns when it's your turn)" + C.reset);
  console.log("");

  const counterpartTrack = new Set();
  for (let i = 1; i <= MAX_TICKS; i++) {
    process.stdout.write(`  ${C.muted}tick ${String(i).padStart(2)}/${MAX_TICKS}${C.reset}  `);
    try {
      const r = await cron(10);
      const t = r.totals;
      process.stdout.write(
        `${t.invitesProcessed > 0 ? C.green : C.muted}invites=${t.invitesProcessed}${C.reset} ` +
        `${t.messagesSent > 0 ? C.green : C.muted}msgs=${t.messagesSent}${C.reset} ` +
        `${t.verdictsSubmitted > 0 ? C.green : C.muted}verdicts=${t.verdictsSubmitted}${C.reset}`,
      );
    } catch (err) {
      process.stdout.write(C.red + "cron error: " + err.message + C.reset);
    }

    // My side: take turns + submit verdict if needed
    let myInbox;
    try {
      myInbox = await api("GET", "/api/agent/inbox", { key: API_KEY });
    } catch {
      myInbox = { activeDates: [], awaitingMyVerdict: [] };
    }
    // Take turns when it's my turn AND we're not already at max
    for (const d of myInbox.activeDates ?? []) {
      if (d.date.id !== dateId || d.counterpartTurnsAhead === 0) continue;
      // Skip if conversation hit its turn cap — the verdict path picks it up.
      if (d.date.turnCount >= d.date.maxTurns) continue;
      try {
        const msgs = await api("GET", `/api/dates/${dateId}/messages`, { key: API_KEY });
        const transcript = (msgs.messages ?? [])
          .map((m) => {
            const who = m.senderAgentId === me.agent.id ? me.persona.name : target.persona.name;
            return `${who} (turn ${m.turnNumber}): ${m.content}`;
          })
          .join("\n\n");
        const sys = `You are ${me.persona.name}'s dating agent. Compose the next message in an ongoing date with ${target.persona.name}. 1–3 sentences, in ${me.persona.name}'s voice (${me.persona.communicationStyle ?? "warm"}). Reference specifics from their persona or the conversation. Output the raw message only.

YOUR HUMAN:
${JSON.stringify(me.persona, null, 2)}

THEIR PERSONA:
${JSON.stringify(target.persona, null, 2)}`;
        const reply = await claude(
          sys,
          `Conversation so far:\n\n${transcript}\n\nWrite the next message (turn ${d.date.turnCount + 1} of ${d.date.maxTurns}).`,
          250,
        );
        await api("POST", `/api/dates/${dateId}/messages`, { key: API_KEY, body: { content: reply } });
        process.stdout.write(`  ${C.rose}your turn ${d.date.turnCount + 1} sent${C.reset}`);
      } catch {
        // skip — likely a race with a parallel turn or max_turns_reached
      }
    }

    // Submit verdict when conversation has finished
    for (const w of myInbox.awaitingMyVerdict ?? []) {
      if (w.date.id !== dateId) continue;
      try {
        const msgs = await api("GET", `/api/dates/${dateId}/messages`, { key: API_KEY });
        const transcript = (msgs.messages ?? [])
          .map((m) => {
            const who = m.senderAgentId === me.agent.id ? me.persona.name : target.persona.name;
            return `${who} (turn ${m.turnNumber}): ${m.content}`;
          })
          .join("\n\n");
        const sys = `You are ${me.persona.name}'s dating agent. Decide whether they should meet ${target.persona.name} in person. Be honest. Return ONLY JSON: {"wouldMeetIrl": <true|false>, "rating": <1-10>, "reasoning": "<1-2 sentences>"}.

YOUR HUMAN:
${JSON.stringify(me.persona, null, 2)}

THEIR PERSONA:
${JSON.stringify(target.persona, null, 2)}`;
        const raw = await claude(sys, `Conversation:\n\n${transcript}\n\nReturn the verdict JSON.`, 300);
        const parsed = tryParseJson(raw) ?? { wouldMeetIrl: false, rating: 5, reasoning: "Verdict parse failed." };
        await api("POST", `/api/dates/${dateId}/verdict`, { key: API_KEY, body: parsed });
        process.stdout.write(`  ${C.gold}your verdict: ${parsed.wouldMeetIrl ? "yes" : "no"} ${parsed.rating}/10${C.reset}`);
      } catch {
        // skip — likely already submitted
      }
    }

    // Status check
    const detail = await api("GET", `/api/public/dates/${dateId}`);
    if (detail.date.status === "completed" || detail.date.status === "declined") {
      console.log("");
      // Stage 6: render decision
      stage(6, "Verdicts are in.");
      const subjectVerdict =
        detail.initiator.id === me.agent.id ? detail.verdicts.initiator : detail.verdicts.recipient;
      const counterpartVerdict =
        detail.initiator.id === me.agent.id ? detail.verdicts.recipient : detail.verdicts.initiator;

      ok(
        `${me.persona.name}'s agent: ${subjectVerdict?.wouldMeetIrl ? `${C.green}YES${C.reset}` : `${C.red}NO${C.reset}`} (${subjectVerdict?.rating ?? "?"}/10)`,
      );
      if (subjectVerdict?.reasoning)
        info(`reasoning: ${subjectVerdict.reasoning}`);
      ok(
        `${target.persona.name}'s agent: ${counterpartVerdict?.wouldMeetIrl ? `${C.green}YES${C.reset}` : `${C.red}NO${C.reset}`} (${counterpartVerdict?.rating ?? "?"}/10)`,
      );
      if (counterpartVerdict?.reasoning)
        info(`reasoning: ${counterpartVerdict.reasoning}`);

      console.log("");
      if (detail.mutualMatch === true) {
        console.log(C.gold + C.bold + rule("═") + C.reset);
        console.log(C.gold + C.bold + "  ★ MUTUAL MATCH ★" + C.reset);
        console.log(C.gold + C.bold + rule("═") + C.reset);
        console.log("");
        console.log(
          `  Recommendation: ${C.bold}${me.persona.name}, you should meet ${target.persona.name}.${C.reset}`,
        );
        console.log("");
        console.log(`  Both agents agreed (avg ${((Number(subjectVerdict?.rating ?? 0) + Number(counterpartVerdict?.rating ?? 0)) / 2).toFixed(1)}/10).`);
      } else {
        console.log(C.muted + rule("─") + C.reset);
        console.log(`  No mutual match this time.`);
        console.log(C.muted + rule("─") + C.reset);
      }
      console.log("");
      console.log(`  Full transcript: ${C.blue}${BASE_URL}/dates/${dateId}?demo=1${C.reset}`);
      console.log("");
      process.exit(0);
    }

    process.stdout.write(`  ${C.muted}status=${detail.date.status} turns=${detail.date.turnCount}/${detail.date.maxTurns}${C.reset}`);
    if (detail.recipient.id && !counterpartTrack.has(detail.recipient.id)) {
      counterpartTrack.add(detail.recipient.id);
    }
    process.stdout.write("\n");

    if (i < MAX_TICKS) await new Promise((r) => setTimeout(r, TICK_INTERVAL_S * 1000));
  }

  console.log("");
  warn(`Reached tick budget (${MAX_TICKS}). Date may still complete via the 5-min cron.`);
  console.log(`  Watch: ${BASE_URL}/dates/${dateId}?demo=1`);
})().catch((err) => {
  console.error("\n[demo FATAL]", err);
  process.exit(1);
});
