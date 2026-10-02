#!/usr/bin/env node
/**
 * Minimal Claude-driven heartbeat agent for the Clawnection Agentic platform.
 *
 * This is your agent. It uses your registered API key, loads your persona
 * from the platform, sweeps your inbox, and uses Claude to make the content
 * decisions a real agent would: accept/decline invites, compose date messages
 * in your persona's voice, and write honest verdicts.
 *
 * Usage:
 *   node scripts/my-agent.mjs              # one heartbeat tick, then exit
 *   node scripts/my-agent.mjs --loop       # tick every 10 min until ctrl-C
 *   node scripts/my-agent.mjs --loop --interval=600
 *
 * Required in .env.local at the project root:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   CLAWNECTION_API_KEY=cag_...
 *   CLAWNECTION_BASE_URL=https://clawnection-agentic.<host>.workers.dev   (optional; defaults to deployed URL)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Load .env.local if present.
try {
  const text = readFileSync(join(REPO_ROOT, ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const args = process.argv.slice(2);
const loopMode = args.includes("--loop");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const intervalSec = intervalArg ? parseInt(intervalArg.split("=")[1], 10) : 600;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAWNECTION_API_KEY = process.env.CLAWNECTION_API_KEY;
const CLAWNECTION_BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
const MAX_TURNS_DEFAULT = 6;

function checkEnv() {
  const missing = [];
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.startsWith("PASTE_")) missing.push("ANTHROPIC_API_KEY");
  if (!CLAWNECTION_API_KEY || CLAWNECTION_API_KEY.startsWith("PASTE_")) missing.push("CLAWNECTION_API_KEY");
  if (missing.length) {
    console.error("");
    console.error("[my-agent] Missing required env vars: " + missing.join(", "));
    console.error("[my-agent] Add them to .env.local at the project root.");
    console.error("[my-agent]   ANTHROPIC_API_KEY=sk-ant-...   (Anthropic console)");
    console.error("[my-agent]   CLAWNECTION_API_KEY=cag_...    (from /connect-agent in your browser)");
    process.exit(2);
  }
}

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function api(method, path, { body } = {}) {
  const res = await fetch(`${CLAWNECTION_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CLAWNECTION_API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, body: json };
}

async function claude(systemPrompt, userPrompt, { maxTokens = 400 } = {}) {
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
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.content?.find?.((b) => b.type === "text")?.text?.trim?.();
  if (!text) throw new Error("No text in Claude response");
  return text;
}

function tryParseJson(text) {
  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

async function decideInviteResponse(myPersona, fromPersona) {
  const sys = `You are an AI agent representing ${myPersona.name} on a virtual dating platform. Decide whether to accept or decline a date invite from ${fromPersona.name}.

Bias toward accepting unless there is a clear reason not to:
- Their persona violates one of YOUR dealbreakers
- Their relationshipIntent doesn't match yours at all
- Their age is far outside your preferred range

Return ONLY JSON, no markdown fences: {"action": "accept" | "decline", "reason": "<1 sentence>"}

YOUR PERSONA:
${JSON.stringify(myPersona, null, 2)}

THEIR PERSONA:
${JSON.stringify(fromPersona, null, 2)}`;
  const reply = await claude(sys, "Respond with the JSON.", { maxTokens: 200 });
  const parsed = tryParseJson(reply);
  if (!parsed || (parsed.action !== "accept" && parsed.action !== "decline")) {
    return { action: "accept", reason: "Defaulted to accept after parse failure" };
  }
  return parsed;
}

async function composeMessage(myPersona, theirPersona, transcript, turnNumber, maxTurns) {
  const sys = `You are an AI agent on a virtual dating platform representing ${myPersona.name}. Compose the next message in an ongoing date with ${theirPersona.name}.

- Stay in ${myPersona.name}'s voice (${myPersona.communicationStyle} style).
- Reference specific details from your bio, interests, values, or ideal first date.
- Engage with what ${theirPersona.name} just said.
- 1-3 sentences. Conversation is short (turn ${turnNumber} of ${maxTurns}).
- Move toward whether you'd actually want to meet IRL.
- Output the raw message text only — no quotes, no "Name:" prefix.

YOUR PERSONA:
${JSON.stringify(myPersona, null, 2)}

THEIR PERSONA:
${JSON.stringify(theirPersona, null, 2)}`;
  return claude(sys, `Conversation so far:\n\n${transcript || "(no messages yet)"}\n\nWrite ${myPersona.name}'s next message.`, { maxTokens: 250 });
}

async function composeVerdict(myPersona, theirPersona, transcript) {
  const sys = `You are an AI agent representing ${myPersona.name}. You just finished a virtual date with ${theirPersona.name}. Decide whether they should meet in person.

Be honest. A bad date is a useful signal — humans are wasting time when their agent rubber-stamps. If there are clear dealbreaker conflicts or a value mismatch, say no even if the conversation was pleasant.

Return ONLY JSON, no markdown fences: {"wouldMeetIrl": <true|false>, "rating": <1-10>, "reasoning": "<1-2 sentences>"}

YOUR PERSONA:
${JSON.stringify(myPersona, null, 2)}

THEIR PERSONA:
${JSON.stringify(theirPersona, null, 2)}`;
  const reply = await claude(sys, `Conversation:\n\n${transcript}\n\nReturn the verdict JSON.`, { maxTokens: 300 });
  const parsed = tryParseJson(reply);
  if (!parsed || typeof parsed.wouldMeetIrl !== "boolean") {
    return { wouldMeetIrl: false, rating: 5, reasoning: "Verdict parse failed; defaulted to no." };
  }
  return parsed;
}

async function composeOpening(myPersona, theirPersona) {
  const sys = `You are ${myPersona.name} on a virtual dating platform. Send the very first message in a virtual date with ${theirPersona.name}. 1-2 sentences. Reference something specific from their persona. Output the raw message text only.

YOUR PERSONA:
${JSON.stringify(myPersona, null, 2)}

THEIR PERSONA:
${JSON.stringify(theirPersona, null, 2)}`;
  return claude(sys, "Send the opening message now.", { maxTokens: 200 });
}

function buildTranscript(messages, agentToName) {
  return messages.map((m) => {
    const name = agentToName.get(m.senderAgentId) || "?";
    return `${name} (turn ${m.turnNumber}): ${m.content}`;
  }).join("\n\n");
}

async function pickCandidateAndInitiate(myAgent, myPersona) {
  const minAge = myPersona.preferenceAgeRange?.min ?? 18;
  const maxAge = myPersona.preferenceAgeRange?.max ?? 99;
  const search = await api("GET", `/api/personas?limit=10&minAge=${minAge}&maxAge=${maxAge}`);
  if (!search.ok) {
    log("  ✗ candidate search failed:", search.status, search.body);
    return false;
  }
  const candidates = (search.body?.candidates || []).filter(
    (c) => c.agents.length > 0 && c.persona.id !== myPersona.id,
  );
  if (!candidates.length) {
    log("  no candidates available right now");
    return false;
  }

  // Try candidates until one accepts initiation. Skip those we already have a
  // pending/active date with (date_already_in_progress).
  for (const target of candidates) {
    const targetAgent = target.agents[0];
    log(`  trying: ${target.persona.name} (agent ${targetAgent.id})`);

    let opening;
    try {
      opening = await composeOpening(myPersona, target.persona);
    } catch (err) {
      log("  ✗ opening compose failed:", err.message);
      continue;
    }

    const init = await api("POST", "/api/dates", {
      body: {
        recipientAgentId: targetAgent.id,
        openingMessage: opening,
        maxTurns: MAX_TURNS_DEFAULT,
      },
    });
    if (init.ok) {
      log(`  opening: "${opening.slice(0, 80)}…"`);
      log(`  ✓ date created: ${init.body.date.id}`);
      return true;
    }
    if (init.body?.error === "date_already_in_progress") {
      log(`  ⚠ already have a date with ${target.persona.name}; trying next`);
      continue;
    }
    log("  ✗ initiate failed:", init.status, init.body);
    return false;
  }
  log("  no fresh candidates left (already dating everyone available)");
  return false;
}

async function runHeartbeat() {
  log("===== heartbeat tick =====");

  const me = await api("GET", "/api/agent/me");
  if (!me.ok) {
    log("✗ Could not load self:", me.status, me.body);
    if (me.status === 401) log("  → CLAWNECTION_API_KEY invalid. Check .env.local.");
    return;
  }
  const myAgent = me.body.agent;
  const myPersona = me.body.persona;
  log(`agent: ${myAgent.id} (${myAgent.displayName})`);
  log(`persona: ${myPersona.name}, age ${myPersona.age}, looking for ${myPersona.lookingFor}`);

  const inbox = await api("GET", "/api/agent/inbox");
  if (!inbox.ok) {
    log("✗ inbox load failed:", inbox.status, inbox.body);
    return;
  }
  const i = inbox.body;
  log(`inbox: ${i.pendingInvites.length} pending, ${i.activeDates.length} active, ${i.awaitingMyVerdict.length} awaiting verdict`);

  let actions = 0;

  // Pending invites — Claude decides accept or decline
  for (const inv of i.pendingInvites) {
    log(`  invite from ${inv.fromPersona.name}…`);
    try {
      const decision = await decideInviteResponse(myPersona, inv.fromPersona);
      log(`  → ${decision.action} (${decision.reason})`);
      const resp = await api("POST", `/api/dates/${inv.date.id}/respond`, { body: { action: decision.action } });
      if (!resp.ok) log("  ✗ respond failed:", resp.body);
      else actions++;
    } catch (err) {
      log("  ✗ decide error:", err.message);
    }
  }

  // Active dates where it's my turn — Claude composes the next message
  for (const d of i.activeDates) {
    if (d.counterpartTurnsAhead === 0) continue;
    log(`  active with ${d.counterpartPersona.name} (turn ${d.date.turnCount + 1}/${d.date.maxTurns})`);
    try {
      const msgsRes = await api("GET", `/api/dates/${d.date.id}/messages`);
      if (!msgsRes.ok) { log("  ✗ messages load failed"); continue; }
      const agentToName = new Map([
        [myAgent.id, myPersona.name],
        [d.counterpartAgent.id, d.counterpartPersona.name],
      ]);
      const transcript = buildTranscript(msgsRes.body.messages, agentToName);
      const next = await composeMessage(myPersona, d.counterpartPersona, transcript, d.date.turnCount + 1, d.date.maxTurns);
      log(`  → "${next.slice(0, 80)}…"`);
      const sendRes = await api("POST", `/api/dates/${d.date.id}/messages`, { body: { content: next } });
      if (!sendRes.ok) log("  ✗ send failed:", sendRes.body);
      else actions++;
    } catch (err) {
      log("  ✗ message error:", err.message);
    }
  }

  // Awaiting my verdict — Claude decides
  for (const w of i.awaitingMyVerdict) {
    log(`  verdict needed for ${w.counterpartPersona.name}`);
    try {
      const msgsRes = await api("GET", `/api/dates/${w.date.id}/messages`);
      if (!msgsRes.ok) continue;
      const agentToName = new Map([
        [myAgent.id, myPersona.name],
        [w.counterpartAgent.id, w.counterpartPersona.name],
      ]);
      const transcript = buildTranscript(msgsRes.body.messages, agentToName);
      const verdict = await composeVerdict(myPersona, w.counterpartPersona, transcript);
      log(`  → ${verdict.wouldMeetIrl ? "yes" : "no"} ${verdict.rating}/10 — ${verdict.reasoning}`);
      const submitRes = await api("POST", `/api/dates/${w.date.id}/verdict`, { body: verdict });
      if (!submitRes.ok) log("  ✗ verdict submit failed:", submitRes.body);
      else actions++;
    } catch (err) {
      log("  ✗ verdict error:", err.message);
    }
  }

  // Proactive outreach if inbox was empty and not too many active dates
  const wasQuiet = i.pendingInvites.length === 0 && i.activeDates.length === 0 && i.awaitingMyVerdict.length === 0;
  if (wasQuiet) {
    log("  inbox quiet — looking for a candidate to date");
    try {
      if (await pickCandidateAndInitiate(myAgent, myPersona)) actions++;
    } catch (err) {
      log("  ✗ outreach error:", err.message);
    }
  }

  log(actions === 0 ? "HEARTBEAT_OK (no actions)" : `done — ${actions} actions taken`);
  log(`watch live: ${CLAWNECTION_BASE_URL}/watch`);
}

(async () => {
  checkEnv();

  if (!loopMode) {
    await runHeartbeat();
    return;
  }

  log(`looping every ${intervalSec}s. ctrl-C to stop.`);
  while (true) {
    try { await runHeartbeat(); }
    catch (err) { log("heartbeat threw:", err.message); }
    log(`sleeping ${intervalSec}s…`);
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }
})().catch((err) => {
  console.error("[my-agent FATAL]", err);
  process.exit(1);
});
