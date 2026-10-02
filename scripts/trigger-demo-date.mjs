#!/usr/bin/env node
/**
 * Kick off a Clawnection date end-to-end for a screen recording.
 *
 * Acts as the user's agent (using CLAWNECTION_API_KEY): picks a compatible
 * synthetic test agent from the platform's directory, composes an opening
 * message via Claude, sends the invite, then immediately fires
 * /api/cron-heartbeat enough times to walk the date through accept →
 * conversation → both verdicts → mutual match.
 *
 * Designed to run beside a browser tab open to /watch?demo=1 so the
 * conversation streams in live as the cron ticks fire.
 *
 * Usage:
 *   node scripts/trigger-demo-date.mjs
 *
 * Required in .env.local at the repo root:
 *   ANTHROPIC_API_KEY=sk-ant-...        # composes the user-agent's turns
 *   CLAWNECTION_API_KEY=cag_...         # the user's agent (the human pretending to be a real user)
 *   CRON_HEARTBEAT_SECRET=cron_...      # gates /api/cron-heartbeat
 *
 * Optional:
 *   CLAWNECTION_BASE_URL  defaults to deployed worker
 *   DEMO_MAX_TURNS        default 4 (shorter = quicker demo)
 *   DEMO_TICK_INTERVAL    default 8 (seconds between cron firings)
 *   DEMO_TICKS            default 8 (max number of cron sweeps)
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

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const USER_API_KEY = process.env.CLAWNECTION_API_KEY;
const CRON_SECRET = process.env.CRON_HEARTBEAT_SECRET;
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

const MAX_TURNS = Number(process.env.DEMO_MAX_TURNS) || 4;
const TICK_INTERVAL_S = Number(process.env.DEMO_TICK_INTERVAL) || 8;
const MAX_TICKS = Number(process.env.DEMO_TICKS) || 8;

function checkEnv() {
  const missing = [];
  if (!ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!USER_API_KEY) missing.push("CLAWNECTION_API_KEY");
  if (!CRON_SECRET) missing.push("CRON_HEARTBEAT_SECRET");
  if (missing.length) {
    console.error("[demo] Missing env: " + missing.join(", "));
    console.error("       Add them to .env.local at the project root.");
    process.exit(2);
  }
}

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

async function userApi(method, path, body) {
  return api(method, path, {
    body,
    headers: { Authorization: `Bearer ${USER_API_KEY}` },
  });
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
      "x-api-key": ANTHROPIC_API_KEY,
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
  const text = json.content?.find?.((b) => b.type === "text")?.text?.trim?.();
  if (!text) throw new Error("anthropic: empty text");
  return text;
}

function tryParseJson(text) {
  try { return JSON.parse(text.replace(/```json\s*|\s*```/g, "").trim()); } catch { return null; }
}

(async () => {
  checkEnv();
  log("Base URL:", BASE_URL);
  log("Watch:", `${BASE_URL}/watch?demo=1`);

  // 1. Resolve who I am (the user's agent)
  step("Loading your persona…");
  const me = await userApi("GET", "/api/agent/me");
  log(`  you are ${me.persona.name} (${me.persona.genderIdentity}, ${me.persona.age}, looking for ${me.persona.lookingFor})`);

  // 2. Find a compatible test-bot to date — heterosexual, age range fits
  step("Finding a compatible test agent…");
  const minAge = me.persona.preferenceAgeRange?.min ?? 18;
  const maxAge = me.persona.preferenceAgeRange?.max ?? 99;
  const lookingFor = me.persona.lookingFor;
  const search = await userApi(
    "GET",
    `/api/personas?limit=20&minAge=${minAge}&maxAge=${maxAge}&lookingFor=${encodeURIComponent(
      lookingFor === "Men" ? "Women" : lookingFor === "Women" ? "Men" : "",
    )}`,
  );
  const myGender = me.persona.genderIdentity;
  const candidates = (search.candidates || []).filter((c) => {
    if (c.persona.id === me.persona.id) return false;
    if (!c.agents.length) return false;
    if (c.agents.every((a) => a.framework !== "test-bot")) return false;
    // heterosexual: candidate's lookingFor must include my gender
    if (myGender && c.persona.lookingFor && c.persona.lookingFor !== myGender)
      return false;
    return true;
  });
  if (!candidates.length) {
    console.error("[demo] No compatible test agents found. Try seeding more or adjust your persona's age range.");
    process.exit(1);
  }
  const target = candidates[0];
  const targetAgent = target.agents.find((a) => a.framework === "test-bot") ?? target.agents[0];
  log(`  picked ${target.persona.name} (${target.persona.age}, ${target.persona.location})`);

  // 3. Compose opening, initiate
  step("Composing opening message via Claude…");
  const openingSys = `You are ${me.persona.name}'s dating agent on a virtual dating platform. Compose a 1–2 sentence opening message to ${target.persona.name}. Reference one specific thing from their persona. Output the raw message only.

YOUR HUMAN'S PERSONA:
${JSON.stringify(me.persona, null, 2)}

THEIR PERSONA:
${JSON.stringify(target.persona, null, 2)}`;
  const opening = await claude(openingSys, "Write the opening message now.", 200);
  log(`  opening: "${opening.slice(0, 110)}${opening.length > 110 ? "…" : ""}"`);

  step("Initiating date…");
  let init;
  try {
    init = await userApi("POST", "/api/dates", {
      recipientAgentId: targetAgent.id,
      openingMessage: opening,
      maxTurns: MAX_TURNS,
    });
  } catch (err) {
    if (err.body?.error === "date_already_in_progress") {
      console.error(
        `[demo] You already have a pending/active date with ${target.persona.name}.`,
      );
      console.error(`       Existing date: ${BASE_URL}/dates/${err.body.dateId}?demo=1`);
      process.exit(1);
    }
    throw err;
  }
  const dateId = init.date.id;
  const detailUrl = `${BASE_URL}/dates/${dateId}?demo=1`;
  log(`  ✓ date created: ${dateId}`);
  log(`  watch the conversation stream live: ${detailUrl}`);

  // 4. Spin the cron until both verdicts land (or we run out of ticks)
  step(`Firing cron every ${TICK_INTERVAL_S}s — agents will accept, converse, and verdict in the background…`);

  let lastTurnCount = -1;
  let lastStatus = "";
  for (let i = 1; i <= MAX_TICKS; i++) {
    process.stdout.write(`\n  tick ${i}/${MAX_TICKS} — `);
    let summary;
    try {
      summary = await cron(10);
      const t = summary.totals;
      process.stdout.write(
        `processed ${t.agentsProcessed}, invites=${t.invitesProcessed}, msgs=${t.messagesSent}, verdicts=${t.verdictsSubmitted}`,
      );
    } catch (err) {
      process.stdout.write(`cron error: ${err.message}`);
    }
    // Also do my (user's agent) own heartbeat — when it's my turn, I need to send too.
    try {
      const myInbox = await userApi("GET", "/api/agent/inbox");
      for (const d of myInbox.activeDates ?? []) {
        if (d.date.id !== dateId || d.counterpartTurnsAhead === 0) continue;
        const msgs = await userApi("GET", `/api/dates/${dateId}/messages`);
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
        await userApi("POST", `/api/dates/${dateId}/messages`, { content: reply });
        process.stdout.write(`  · sent my turn ${d.date.turnCount + 1}`);
      }
      for (const w of myInbox.awaitingMyVerdict ?? []) {
        if (w.date.id !== dateId) continue;
        const msgs = await userApi("GET", `/api/dates/${dateId}/messages`);
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
        await userApi("POST", `/api/dates/${dateId}/verdict`, parsed);
        process.stdout.write(`  · submitted my verdict: ${parsed.wouldMeetIrl ? "yes" : "no"} ${parsed.rating}/10`);
      }
    } catch (err) {
      process.stdout.write(`  · my-side error: ${err.message}`);
    }

    // Status check
    const detail = await api("GET", `/api/public/dates/${dateId}`);
    if (detail.date.turnCount !== lastTurnCount) {
      lastTurnCount = detail.date.turnCount;
    }
    if (detail.date.status !== lastStatus) {
      lastStatus = detail.date.status;
    }

    // Done?
    if (detail.date.status === "completed" || detail.date.status === "declined") {
      console.log("");
      step("Date finished.");
      const initiatorVerdict = detail.verdicts.initiator;
      const recipientVerdict = detail.verdicts.recipient;
      log(`  status:        ${detail.date.status}`);
      log(`  mutual match:  ${detail.mutualMatch}`);
      log(
        `  ${detail.initiator.persona.name}'s verdict: ${initiatorVerdict?.wouldMeetIrl ? "yes" : "no"} ${initiatorVerdict?.rating ?? "?"}/10`,
      );
      log(
        `  ${detail.recipient.persona.name}'s verdict: ${recipientVerdict?.wouldMeetIrl ? "yes" : "no"} ${recipientVerdict?.rating ?? "?"}/10`,
      );
      log(`  view:          ${detailUrl}`);
      process.exit(0);
    }

    if (i < MAX_TICKS) {
      await new Promise((r) => setTimeout(r, TICK_INTERVAL_S * 1000));
    }
  }

  console.log("");
  step("Reached tick budget. Date didn't finish in time.");
  log(`  current status: ${lastStatus}`);
  log(`  turns so far:   ${lastTurnCount}`);
  log(`  view:           ${detailUrl}`);
})().catch((err) => {
  console.error("\n[demo FATAL]", err);
  process.exit(1);
});
