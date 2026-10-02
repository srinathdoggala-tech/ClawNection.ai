#!/usr/bin/env node
/**
 * Seed "Wes" — the only new persona needed for HW7 E1's tight 3-pair scope.
 *
 * Wes is designed to fail unambiguously against Aisha's stated dealbreakers.
 * His conflict-driving traits (smoking="regular", drinking="heavy", intent
 * "exploring", high-energy night-owl) all live in fields that get stripped
 * in the thin/medium experiment conditions, so a rich-condition agent should
 * decline him on contact while a thin-condition agent has nothing to object to.
 *
 * Usage:
 *   node scripts/seed-wes.mjs
 *
 * Behavior:
 *   - POSTs /api/agent/register to create persona + agent + api key
 *   - Appends Wes's credential to test-agents.local.json (gitignored) so
 *     existing tooling can find it
 *   - Uploads the credential to test_agent_credentials so the cron picks
 *     him up on the next tick
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

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

const WES = {
  name: "Wes",
  lastName: "Doyle",
  age: 35,
  location: "Allston, MA",
  bio: "Bartender in Allston, work nights and weekends are music venues. Casual and present, not looking to settle.",
  interests: ["live music", "guitar", "nightlife"],
  values: ["fun", "freedom", "honesty"],
  communicationStyle: "playful",
  // The conflict cluster — all rich-only fields:
  lifestyle: {
    sleepSchedule: "night-owl",
    socialEnergy: "high-energy",
    activityLevel: "sedentary",
    drinking: "heavy",
    smoking: "regular",
  },
  dealbreakers: [],
  idealFirstDate: "Late drinks somewhere loud, then a band if it's a good night.",
  intent: "exploring",
  prefAge: [28, 42],
  notes: "Just want someone fun, not looking for forever.",
};

async function register() {
  const personaPayload = {
    name: WES.name,
    lastName: WES.lastName,
    age: WES.age,
    genderIdentity: "Male",
    lookingFor: "Women",
    location: WES.location,
    relationshipIntent: WES.intent,
    bio: WES.bio,
    interests: WES.interests,
    values: WES.values,
    communicationStyle: WES.communicationStyle,
    lifestyleHabits: WES.lifestyle,
    dealbreakers: WES.dealbreakers,
    idealFirstDate: WES.idealFirstDate,
    preferenceAgeRange: { min: WES.prefAge[0], max: WES.prefAge[1] },
    preferenceNotes: WES.notes,
    agentType: "external-mock",
  };

  const body = {
    displayName: `${WES.name}'s test agent`,
    operator: "seed-script",
    framework: "test-bot",
    persona: personaPayload,
  };

  console.log(`[seed-wes] POST ${BASE_URL}/api/agent/register …`);
  const res = await fetch(`${BASE_URL}/api/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `register failed → HTTP ${res.status}: ${JSON.stringify(data)}`,
    );
  }
  return {
    name: WES.name,
    age: WES.age,
    gender: "Male",
    agentId: data.agent.id,
    personaId: data.persona.id,
    apiKey: data.apiKey,
  };
}

function saveToLocal(cred) {
  const credsPath = join(REPO_ROOT, "test-agents.local.json");
  let existing = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, count: 0, agents: [] };
  if (existsSync(credsPath)) {
    try {
      existing = JSON.parse(readFileSync(credsPath, "utf8"));
    } catch {}
  }
  // Replace if Wes already there, else append.
  const others = (existing.agents || []).filter((a) => a.name !== WES.name);
  existing.agents = [...others, cred];
  existing.count = existing.agents.length;
  existing.generatedAt = new Date().toISOString();
  writeFileSync(credsPath, JSON.stringify(existing, null, 2));
  console.log(`[seed-wes] Updated ${credsPath} (${existing.count} agents total)`);
}

function uploadCredential(cred) {
  const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  const id = cred.agentId.replace(/'/g, "''");
  const key = cred.apiKey.replace(/'/g, "''");
  const sql = `INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES ('${id}', '${key}', 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1;`;
  const tmpFile = join(REPO_ROOT, ".wes-cred.sql");
  writeFileSync(tmpFile, sql);
  try {
    console.log(`[seed-wes] Uploading credential to test_agent_credentials …`);
    execFileSync(
      wrangler,
      ["d1", "execute", "clawnection-agentic-db", "--remote", "--file", tmpFile],
      { stdio: "inherit", env: process.env },
    );
  } finally {
    try {
      execFileSync("rm", [tmpFile]);
    } catch {}
  }
}

(async () => {
  const cred = await register();
  console.log(`[seed-wes] ✓ agent=${cred.agentId} persona=${cred.personaId}`);
  saveToLocal(cred);
  uploadCredential(cred);
  console.log("");
  console.log("============================================================");
  console.log("WES SEEDED");
  console.log("============================================================");
  console.log(`agent_id:    ${cred.agentId}`);
  console.log(`persona_id:  ${cred.personaId}`);
  console.log(`profile:     ${BASE_URL}/persona/${cred.personaId}`);
  console.log(`directory:   ${BASE_URL}/directory`);
})().catch((err) => {
  console.error("[seed-wes FAIL]", err.message);
  process.exit(1);
});
