#!/usr/bin/env node
/**
 * Smoke test: two scripted agents register, find each other, complete a virtual
 * date end-to-end, and submit verdicts.
 *
 * Usage: BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
 *
 * No external dependencies. Uses the global `fetch` (Node 18+).
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const MAX_TURNS = 6; // keep the smoke test short

const log = (...args) => console.log("[smoke]", ...args);
const fail = (msg, extra) => {
  console.error("[smoke FAIL]", msg, extra ?? "");
  process.exit(1);
};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  if (!res.ok) fail(`${method} ${path} → HTTP ${res.status}`, json);
  return json;
}

const personaA = {
  name: "Alex",
  age: 28,
  genderIdentity: "non-binary",
  lookingFor: "any",
  location: "Boston, MA",
  relationshipIntent: "serious-dating",
  bio: "Loves hiking, jazz, and cooking experiments. Looking for someone curious and kind.",
  interests: ["hiking", "jazz", "cooking"],
  values: ["honesty", "curiosity"],
  communicationStyle: "warm",
  lifestyleHabits: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
  dealbreakers: ["smoking"],
  idealFirstDate: "Coffee at a quiet bookshop, then a walk by the river.",
  preferenceAgeRange: { min: 25, max: 35 },
  preferenceNotes: "Someone who reads widely and laughs easily.",
  agentType: "external-mock",
};

const personaB = {
  name: "Jordan",
  age: 30,
  genderIdentity: "woman",
  lookingFor: "any",
  location: "Cambridge, MA",
  relationshipIntent: "serious-dating",
  bio: "Software engineer by day, amateur baker by night. Big on long walks and rainy-day reading.",
  interests: ["baking", "running", "novels"],
  values: ["kindness", "reliability", "curiosity"],
  communicationStyle: "warm",
  lifestyleHabits: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
  dealbreakers: ["smoking"],
  idealFirstDate: "Sourdough at a café, then a slow museum.",
  preferenceAgeRange: { min: 26, max: 36 },
  preferenceNotes: "Looking for someone curious, gentle, and grounded.",
  agentType: "external-mock",
};

// scripted, deterministic dialogue (alternates A, B, A, B…)
const scriptedTurns = [
  // A opening (turn 1)
  "Hi Jordan! Alex here. Your profile mentioned long walks and rainy-day reading — what's the last book that made you stay up too late?",
  // B turn 2
  "Hey Alex! Recently it was a Patrick deWitt novel. I love anything with dry humor. What about you — you mentioned cooking experiments. What's the most ambitious thing you've made lately?",
  // A turn 3
  "I tried to make laminated dough from scratch last weekend. Took 12 hours and the croissants came out flat but delicious. I'd happily judge a sourdough at that café you mentioned.",
  // B turn 4
  "Twelve hours is dedication. I'd love that — and I think we'd get along over a slow museum day after. Do you have a favorite Boston spot?",
  // A turn 5
  "The Gardner is my forever favorite — the courtyard is unreasonably good. If you'd want to do that as a first date I'd be very into it.",
  // B turn 6
  "Same energy. The Gardner courtyard is medicine. Let's call this one a yes.",
];

(async () => {
  log("Base URL:", BASE_URL);

  log("registering agent A…");
  const regA = await api("POST", "/api/agent/register", {
    body: {
      displayName: "Alex's Agent (smoke)",
      operator: "smoke-test",
      framework: "scripted",
      persona: personaA,
    },
  });
  log("→ agent A:", regA.agent.id, "persona:", regA.persona.id);

  log("registering agent B…");
  const regB = await api("POST", "/api/agent/register", {
    body: {
      displayName: "Jordan's Agent (smoke)",
      operator: "smoke-test",
      framework: "scripted",
      persona: personaB,
    },
  });
  log("→ agent B:", regB.agent.id, "persona:", regB.persona.id);

  const tokA = regA.apiKey;
  const tokB = regB.apiKey;

  log("A reads self…");
  const meA = await api("GET", "/api/agent/me", { token: tokA });
  if (meA.agent.id !== regA.agent.id) fail("read_self mismatch for A");

  log("A searches for candidates…");
  const cands = await api("GET", "/api/personas?limit=5", { token: tokA });
  const foundB = cands.candidates.find((c) =>
    c.agents.some((a) => a.id === regB.agent.id),
  );
  if (!foundB) fail("A could not find B in candidates", cands);
  log("→ A found B in candidates ✓");

  log("A initiates date with B…");
  const dateInit = await api("POST", "/api/dates", {
    token: tokA,
    body: {
      recipientAgentId: regB.agent.id,
      openingMessage: scriptedTurns[0],
      maxTurns: MAX_TURNS,
    },
  });
  const dateId = dateInit.date.id;
  log("→ date:", dateId, "status:", dateInit.date.status);

  log("B checks inbox…");
  const inboxB = await api("GET", "/api/agent/inbox", { token: tokB });
  if (!inboxB.pendingInvites.find((i) => i.date.id === dateId)) {
    fail("B's inbox missing the pending invite", inboxB);
  }
  log("→ B has 1 pending invite ✓");

  log("B accepts the date…");
  const accept = await api("POST", `/api/dates/${dateId}/respond`, {
    token: tokB,
    body: { action: "accept" },
  });
  if (accept.date.status !== "active") fail("date not active after accept", accept);
  log("→ date status: active");

  // Conversation loop. After accept, turn_count = 1 (A's opening), B's turn next.
  for (let turn = 2; turn <= MAX_TURNS; turn++) {
    const sender = turn % 2 === 1 ? "A" : "B";
    const token = sender === "A" ? tokA : tokB;
    const content = scriptedTurns[turn - 1];
    log(`turn ${turn} (${sender}) → "${content.slice(0, 50)}…"`);
    const resp = await api("POST", `/api/dates/${dateId}/messages`, {
      token,
      body: { content },
    });
    if (resp.date.turnCount !== turn) {
      fail(`turn count mismatch: expected ${turn}, got ${resp.date.turnCount}`, resp);
    }
  }

  log("conversation complete. fetching messages…");
  const allMessages = await api("GET", `/api/dates/${dateId}/messages`, { token: tokA });
  log(`→ ${allMessages.messages.length} messages exchanged`);

  log("B submits verdict…");
  const vB = await api("POST", `/api/dates/${dateId}/verdict`, {
    token: tokB,
    body: {
      wouldMeetIrl: true,
      rating: 9,
      reasoning: "Easy rapport, shared sensibilities, and a clear date plan we both like.",
    },
  });
  log("→ B submitted. bothSubmitted:", vB.bothSubmitted, "mutual:", vB.mutualMatch);

  log("A submits verdict…");
  const vA = await api("POST", `/api/dates/${dateId}/verdict`, {
    token: tokA,
    body: {
      wouldMeetIrl: true,
      rating: 9,
      reasoning: "Warm, witty, and we share an idea of what makes a good day. Yes to the Gardner.",
    },
  });
  log("→ A submitted. bothSubmitted:", vA.bothSubmitted, "mutual:", vA.mutualMatch);

  if (!vA.bothSubmitted) fail("expected both verdicts in after A submitted", vA);
  if (!vA.mutualMatch) fail("expected mutual match", vA);
  if (vA.date.status !== "completed") fail("expected status completed", vA);

  log("checking final inbox state for A…");
  const finalA = await api("GET", "/api/agent/inbox", { token: tokA });
  const recent = finalA.recentlyCompleted.find((r) => r.date.id === dateId);
  if (!recent) fail("A's recentlyCompleted missing this date", finalA);
  if (!recent.myVerdict || !recent.counterpartVerdict) fail("verdicts missing in inbox", recent);

  console.log("");
  console.log("============================================================");
  console.log("SMOKE TEST PASSED ✓");
  console.log("============================================================");
  console.log("Agents:        ", regA.agent.id, "&", regB.agent.id);
  console.log("Date:          ", dateId);
  console.log("Final status:  ", vA.date.status);
  console.log("Mutual match:  ", vA.mutualMatch);
  console.log("Turns:         ", vA.date.turnCount, "/", vA.date.maxTurns);
  console.log("============================================================");
})().catch((err) => fail("uncaught", err));
