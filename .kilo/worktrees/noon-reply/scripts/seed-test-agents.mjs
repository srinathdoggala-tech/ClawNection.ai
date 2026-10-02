#!/usr/bin/env node
/**
 * Seed 20 hand-curated synthetic test agents on the Clawnection platform.
 *
 * Usage:
 *   node scripts/seed-test-agents.mjs
 *
 * Behavior:
 *   - Reads CLAWNECTION_BASE_URL from env or .env.local (default: deployed worker)
 *   - For each persona below:
 *       1. POSTs /api/agent/register
 *       2. Captures the new agent_id + api_key
 *   - Writes all credentials to test-agents.local.json (gitignored) at the
 *     repo root, so Phase B (the cron heartbeat) can read them later.
 *   - Idempotent at the persona-id level: if you re-run, the registration
 *     reuses the existing profile (POST /api/profiles is upsert-by-id) and
 *     creates a fresh agent each time. To avoid duplicate agents, only run
 *     once. To clean up, drop the agents/profiles tables in D1 and re-seed.
 *
 * Cost: $0 — no LLM calls during seeding.
 */

import { readFileSync, writeFileSync } from "node:fs";
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

const log = (...a) => console.log("[seed]", ...a);

// ============================================================
// 20 personas — 10 male + 10 female, ages 20..47 in 3-year steps.
//
// Interest-cluster strategy (every persona belongs to a primary cluster
// + 1-2 cross-cluster interests so any new user finds plausible matches):
//   OUT  = Outdoor / active (hiking, running, climbing, yoga, biking)
//   ART  = Arts / culture (museums, jazz, theater, photography, live music)
//   FOOD = Food / cooking (cooking, baking, restaurants, wine, coffee)
//   IDEA = Intellectual (reading, podcasts, board games, history, sci-fi)
//   WELL = Wellness / lifestyle (meditation, gardening, walks, journaling)
//
// Locations all in metro Boston so the location filter still bites.
// ============================================================

const personas = [
  // -------- MEN --------
  {
    name: "Marcus", lastName: "Chen", age: 20,
    location: "Cambridge, MA",
    bio: "Sophomore studying CS, ran cross-country in high school, learning to bake. Looking for someone who'll let me try out a new sourdough recipe on them.",
    interests: ["running", "baking", "video games"],
    values: ["honesty", "growth", "humor"],
    communicationStyle: "playful",
    lifestyle: { sleepSchedule: "night-owl", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking"],
    idealFirstDate: "Coffee on a porch, then a long walk.",
    intent: "exploring",
    prefAge: [19, 27], notes: "Curious, low-drama, doesn't take themselves too seriously.",
  },
  {
    name: "Jonathan", lastName: "Park", age: 23,
    location: "Allston, MA",
    bio: "Junior PM at a fintech, training for a half marathon, board-game evangelist. Will absolutely teach you Wingspan.",
    interests: ["running", "board games", "podcasts"],
    values: ["consistency", "curiosity", "kindness"],
    communicationStyle: "warm",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "flakiness"],
    idealFirstDate: "Saturday morning run along the Charles, brunch after.",
    intent: "serious-dating",
    prefAge: [22, 30], notes: "Looking for someone communicative who wants a real partnership.",
  },
  {
    name: "Andre", lastName: "Williams", age: 26,
    location: "Somerville, MA",
    bio: "Architect by day, jazz pianist on weekends. Deeply attached to Davis Square and reasonable bedtimes.",
    interests: ["jazz", "live music", "photography", "cooking"],
    values: ["thoughtfulness", "craft", "honesty"],
    communicationStyle: "reflective",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking"],
    idealFirstDate: "Drinks at a quiet jazz bar in the South End.",
    intent: "long-term",
    prefAge: [24, 32], notes: "Someone who appreciates quiet evenings and slow conversations.",
  },
  {
    name: "Daniel", lastName: "Reyes", age: 29,
    location: "Brookline, MA",
    bio: "Pediatrics resident, weekend hiker, terrible at chess but trying. Coffee snob, working on it.",
    interests: ["hiking", "coffee", "reading"],
    values: ["kindness", "patience", "growth"],
    communicationStyle: "warm",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "never", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Trail head at sunrise, breakfast burritos after.",
    intent: "long-term",
    prefAge: [26, 34], notes: "Looking for warmth, depth, someone who gets that medicine eats most of my evenings.",
  },
  {
    name: "Tomás", lastName: "Alvarez", age: 32,
    location: "Jamaica Plain, MA",
    bio: "High school history teacher, podcast host on the side, can talk for an hour about the Roman Republic. Will not.",
    interests: ["history", "podcasts", "live music", "cooking"],
    values: ["curiosity", "honesty", "patience"],
    communicationStyle: "reflective",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "rudeness"],
    idealFirstDate: "Slow Saturday lunch, then JP Pond loop.",
    intent: "long-term",
    prefAge: [28, 36], notes: "Someone with a real interior life who reads books to the end.",
  },
  {
    name: "Liam", lastName: "O'Connor", age: 35,
    location: "Cambridge, MA",
    bio: "Mech engineer, climbs at MetroRock most weekends, learning Italian. Cooks one perfect dish.",
    interests: ["climbing", "cooking", "reading"],
    values: ["reliability", "growth", "humor"],
    communicationStyle: "direct",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "flakiness"],
    idealFirstDate: "Climb in the morning, pasta at my place after — yes I'm cooking.",
    intent: "long-term",
    prefAge: [30, 40], notes: "Someone outdoorsy and steady, comfortable with quiet weeknights.",
  },
  {
    name: "Devon", lastName: "Walker", age: 38,
    location: "Boston, MA",
    bio: "Civil engineer turning a brownstone gut-reno into a slow weekend project. Avid reader, cautious dater.",
    interests: ["reading", "gardening", "wine"],
    values: ["thoughtfulness", "patience", "depth"],
    communicationStyle: "reflective",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Bookstore wander, dinner that doesn't end before 9.",
    intent: "long-term",
    prefAge: [32, 42], notes: "Someone who values depth over novelty.",
  },
  {
    name: "Rafael", lastName: "Cordero", age: 41,
    location: "Brookline, MA",
    bio: "Restaurant chef, Tuesday-and-Wednesday off so my evenings look funny. Teaches knife skills to anyone willing.",
    interests: ["cooking", "wine", "live music"],
    values: ["honesty", "craft", "warmth"],
    communicationStyle: "warm",
    lifestyle: { sleepSchedule: "night-owl", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking"],
    idealFirstDate: "Late dinner at the chef's table on a Tuesday.",
    intent: "serious-dating",
    prefAge: [33, 44], notes: "Comfortable with weeknight-day-off life.",
  },
  {
    name: "Henry", lastName: "Brennan", age: 44,
    location: "Newton, MA",
    bio: "Civil litigator with two huskies, coaches kid soccer on weekends. Divorced, kids 9 and 11. Calm, steady, finally ready.",
    interests: ["hiking", "running", "reading"],
    values: ["honesty", "kindness", "stability"],
    communicationStyle: "direct",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Walk with the dogs along the reservoir, lunch after.",
    intent: "long-term",
    prefAge: [36, 47], notes: "Wants someone good with kids, not in a rush.",
  },
  {
    name: "Eric", lastName: "Whitman", age: 47,
    location: "Somerville, MA",
    bio: "Software architect, woodworker, sails out of Marblehead in the summer. Grown kid in college. Patient.",
    interests: ["sailing", "woodworking", "jazz", "reading"],
    values: ["honesty", "presence", "humor"],
    communicationStyle: "balanced",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Coffee somewhere quiet, second date is the boat.",
    intent: "long-term",
    prefAge: [38, 50], notes: "Looking for someone settled, curious, comfortable with their own company.",
  },

  // -------- WOMEN --------
  {
    name: "Maya", lastName: "Sharma", age: 20,
    location: "Cambridge, MA",
    bio: "Junior studying neuroscience, runs the pottery club, makes terrible mugs that I love. Trying every coffee shop in Cambridge methodically.",
    interests: ["pottery", "running", "coffee"],
    values: ["curiosity", "kindness", "playfulness"],
    communicationStyle: "playful",
    lifestyle: { sleepSchedule: "night-owl", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking"],
    idealFirstDate: "Coffee shop crawl, see how many we can hit before we tap out.",
    intent: "exploring",
    prefAge: [19, 26], notes: "Curious, kind, doesn't take themselves seriously.",
  },
  {
    name: "Sophie", lastName: "Martin", age: 23,
    location: "Allston, MA",
    bio: "First year teaching English in Boston public schools. Reading my way through the New York Times bestseller list. Ask me about my book club.",
    interests: ["reading", "podcasts", "live music"],
    values: ["thoughtfulness", "consistency", "warmth"],
    communicationStyle: "warm",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "rudeness"],
    idealFirstDate: "Bookstore browse, then a slow walk somewhere green.",
    intent: "serious-dating",
    prefAge: [22, 30], notes: "Looking for someone communicative and emotionally available.",
  },
  {
    name: "Priya", lastName: "Iyer", age: 26,
    location: "Cambridge, MA",
    bio: "ML researcher at a startup, weekend yogi, learning to surf. Will plan the entire vacation if you let me.",
    interests: ["yoga", "podcasts", "reading"],
    values: ["growth", "honesty", "intentionality"],
    communicationStyle: "reflective",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Yoga together if you're brave, brunch after.",
    intent: "long-term",
    prefAge: [25, 33], notes: "Someone steady, ambitious without being intense, kind to service workers.",
  },
  {
    name: "Hannah", lastName: "Goldberg", age: 29,
    location: "Brookline, MA",
    bio: "Pediatric OT. Big on long walks, used bookstores, and rainy-day reading. Dog person, allergic to cats.",
    interests: ["reading", "long walks", "thrift stores"],
    values: ["kindness", "reliability", "curiosity"],
    communicationStyle: "warm",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Sourdough at a café, then a slow museum.",
    intent: "long-term",
    prefAge: [27, 35], notes: "Looking for someone curious, gentle, and grounded.",
  },
  {
    name: "Elena", lastName: "Russo", age: 32,
    location: "Somerville, MA",
    bio: "Architect, gardener, Sunday-morning runner. Italian grandma taught me everything that matters in a kitchen.",
    interests: ["gardening", "running", "cooking"],
    values: ["honesty", "warmth", "patience"],
    communicationStyle: "warm",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking"],
    idealFirstDate: "Saturday morning farmers' market, cook something with what we find.",
    intent: "long-term",
    prefAge: [30, 40], notes: "Someone who wants a real life with someone, not just a series of dates.",
  },
  {
    name: "Catherine", lastName: "Doyle", age: 35,
    location: "Boston, MA",
    bio: "ER nurse, climbs to decompress, photography on the side. Calm in chaos, allergic to wishy-washy.",
    interests: ["climbing", "photography", "live music"],
    values: ["honesty", "directness", "presence"],
    communicationStyle: "direct",
    lifestyle: { sleepSchedule: "flexible", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "flakiness"],
    idealFirstDate: "Climbing gym, see how you problem-solve when frustrated.",
    intent: "serious-dating",
    prefAge: [30, 42], notes: "Looking for someone direct, emotionally regulated, and game.",
  },
  {
    name: "Aisha", lastName: "Khan", age: 38,
    location: "Cambridge, MA",
    bio: "Biotech founder, two cats, learning the cello at 38 because why not. Slow weekends, intense weeks.",
    interests: ["jazz", "reading", "cooking", "wine"],
    values: ["depth", "honesty", "humor"],
    communicationStyle: "reflective",
    lifestyle: { sleepSchedule: "night-owl", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Late dinner, end at a jazz club for one drink.",
    intent: "long-term",
    prefAge: [34, 46], notes: "Wants someone with their own thing going, secure enough to want a partner not a project.",
  },
  {
    name: "Beatrice", lastName: "Hayes", age: 41,
    location: "Brookline, MA",
    bio: "Civil rights attorney. Daughter is 13. Patient, particular, can pack for a weekend in 8 minutes flat.",
    interests: ["reading", "hiking", "history"],
    values: ["integrity", "warmth", "directness"],
    communicationStyle: "direct",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty", "rudeness"],
    idealFirstDate: "Hike with good views, dinner in town after.",
    intent: "long-term",
    prefAge: [38, 50], notes: "Looking for steady, self-aware, someone who likes kids without overdoing it.",
  },
  {
    name: "Naomi", lastName: "Levin", age: 44,
    location: "Newton, MA",
    bio: "Therapist in private practice. Ran a marathon for my 40th, surprised myself. Recently divorced, doing my own work, ready.",
    interests: ["running", "reading", "gardening"],
    values: ["honesty", "self-awareness", "kindness"],
    communicationStyle: "warm",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Long Sunday brunch, walk around Crystal Lake after.",
    intent: "long-term",
    prefAge: [40, 52], notes: "Someone done with proving things, curious about a real partnership.",
  },
  {
    name: "Diane", lastName: "Whitfield", age: 47,
    location: "Cambridge, MA",
    bio: "Nonprofit executive, rower out of CRI, two dogs, one grown kid. Comfortable in my own life, looking for a co-pilot.",
    interests: ["rowing", "reading", "wine", "gardening"],
    values: ["honesty", "presence", "humor"],
    communicationStyle: "balanced",
    lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
    dealbreakers: ["smoking", "dishonesty"],
    idealFirstDate: "Coffee on the river before practice, breakfast after.",
    intent: "long-term",
    prefAge: [42, 55], notes: "Wants someone settled, kind, and quietly funny.",
  },
];

if (personas.length !== 20) {
  throw new Error(`Expected 20 personas, got ${personas.length}`);
}

// Validation: ages match the spec exactly.
const expectedAges = [20, 23, 26, 29, 32, 35, 38, 41, 44, 47];
const menAges = personas.slice(0, 10).map((p) => p.age);
const womenAges = personas.slice(10).map((p) => p.age);
if (JSON.stringify(menAges) !== JSON.stringify(expectedAges)) {
  throw new Error("Men ages mismatch: " + menAges.join(","));
}
if (JSON.stringify(womenAges) !== JSON.stringify(expectedAges)) {
  throw new Error("Women ages mismatch: " + womenAges.join(","));
}

// ============================================================
// Build the persona payload + register each agent.
// ============================================================

function genderFor(idx) {
  return idx < 10 ? "Male" : "Female";
}
function lookingForFor(idx) {
  return idx < 10 ? "Women" : "Men";
}

async function registerOne(idx, p) {
  const gender = genderFor(idx);
  const lookingFor = lookingForFor(idx);
  const personaPayload = {
    name: p.name,
    lastName: p.lastName,
    age: p.age,
    genderIdentity: gender,
    lookingFor,
    location: p.location,
    relationshipIntent: p.intent,
    bio: p.bio,
    interests: p.interests,
    values: p.values,
    communicationStyle: p.communicationStyle,
    lifestyleHabits: p.lifestyle,
    dealbreakers: p.dealbreakers,
    idealFirstDate: p.idealFirstDate,
    preferenceAgeRange: { min: p.prefAge[0], max: p.prefAge[1] },
    preferenceNotes: p.notes,
    agentType: "external-mock",
  };

  const body = {
    displayName: `${p.name}'s test agent`,
    operator: "seed-script",
    framework: "test-bot",
    persona: personaPayload,
  };

  const res = await fetch(`${BASE_URL}/api/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`register ${p.name} (${gender}, ${p.age}) → HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return {
    name: p.name,
    age: p.age,
    gender,
    agentId: data.agent.id,
    personaId: data.persona.id,
    apiKey: data.apiKey,
  };
}

(async () => {
  log("Base URL:", BASE_URL);
  log(`Registering ${personas.length} test agents…`);

  const credentials = [];
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    process.stdout.write(`  [${String(i + 1).padStart(2, " ")}/${personas.length}] ${p.name} (${genderFor(i)}, ${p.age})… `);
    try {
      const cred = await registerOne(i, p);
      credentials.push(cred);
      console.log("✓", cred.agentId);
    } catch (err) {
      console.log("✗");
      console.error("    ", err.message);
    }
  }

  // Save credentials for Phase B (cron heartbeat) — gitignored.
  const outPath = join(REPO_ROOT, "test-agents.local.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        count: credentials.length,
        agents: credentials,
      },
      null,
      2,
    ),
  );

  console.log("");
  console.log("============================================================");
  console.log(`SEEDED ${credentials.length} TEST AGENTS`);
  console.log("============================================================");
  console.log(`Credentials saved to: ${outPath}`);
  console.log(`Live directory:      ${BASE_URL}/directory`);
})().catch((err) => {
  console.error("[seed FAIL]", err);
  process.exit(1);
});
