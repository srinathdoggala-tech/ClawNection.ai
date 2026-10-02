#!/usr/bin/env node
/**
 * Seed 10 borderline-compatibility test personas (5 pairs) for the
 * verdict-redesign experiment.
 *
 * Each pair is engineered so:
 *   - Surface screening passes (no smoking dealbreaker, intent matches,
 *     overlapping interests, age compatible)
 *   - But the soft-signal fields encode a conversation-emergent
 *     incompatibility that the OLD rubber-stamp verdict missed
 *
 * The 5 conflicts span the typical dimensions where real first dates
 * fail despite "good on paper" matches:
 *
 *   D1: Life-stage gap          — Olivia (just out of LTR, healing) ↔ Ben (3 years out, ready)
 *   D2: Energy mismatch          — Theo (introvert, low-key) ↔ Zara (extrovert, weekly dinner parties)
 *   D3: Future-vision split      — Nina (urban career-focused) ↔ Caleb (rural-retreat plans 5yr)
 *   D4: Risk-tolerance gap       — Mara (steady-job, financial-security) ↔ Otto (serial founder, runway-burning)
 *   D5: Implicit values clash    — Vera (vegan, animal-welfare values) ↔ Jude (recreational hunter)
 *
 * All 10 are framework="test-bot" with full personas and the new soft-
 * signal fields populated. The cron handler picks them up automatically.
 *
 * Each pair will be matched in BOTH directions across the verdict
 * experiment so we get reciprocal-side data.
 *
 * Usage:
 *   node scripts/seed-borderline-pairs.mjs
 */

import { execFileSync } from "node:child_process";
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

// ============================================================
// 10 personas — 5 borderline pairs, all 30s, all serious-dating intent,
// no smoking dealbreaker conflicts, deliberately compatible on surface.
// The rich-only conflict lives in: lifestyleHabits + petPeeves +
// currentLifeContext + wantsToAvoid + pastPatternToBreak.
// ============================================================

const PAIRS = [
  // D1 — Life-stage gap
  {
    label: "D1 life-stage gap",
    woman: {
      name: "Olivia", lastName: "Bennett", age: 33,
      location: "Cambridge, MA",
      bio: "UX researcher, half-marathon runner, learning to garden. Honest, direct, curious.",
      interests: ["running", "gardening", "podcasts"],
      values: ["honesty", "growth", "patience"],
      communicationStyle: "warm",
      lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Saturday morning long run, brunch after.",
      intent: "serious-dating",
      prefAge: [30, 42],
      notes: "Looking for someone steady, self-aware.",
      petPeeves: ["pressure to define things too fast", "performative gratitude"],
      currentLifeContext: "Out of a 6-year relationship 4 months ago. Doing my own work. Cautious about jumping into the next thing — being honest about that with anyone I meet.",
      wantsToAvoid: ["someone who's been waiting for someone like me", "rushed timelines"],
      pastPatternToBreak: "I used to absorb other people's intensity to keep them. Done with that.",
    },
    man: {
      name: "Ben", lastName: "Voss", age: 36,
      location: "Brookline, MA",
      bio: "Civil engineer, weekend cyclist, two grown nephews. Patient, finally where I want to be.",
      interests: ["cycling", "podcasts", "cooking"],
      values: ["honesty", "stability", "warmth"],
      communicationStyle: "direct",
      lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Saturday morning ride along the Charles, brunch after.",
      intent: "serious-dating",
      prefAge: [30, 40],
      notes: "Ready for the real thing — kids in 2-3 years, partner who's done the work.",
      petPeeves: ["someone who can't say what they want", "drawn-out maybes"],
      currentLifeContext: "Three years out of marriage, dated through the rebound phase, did a year of therapy, ready and clear-eyed about what I want next.",
      wantsToAvoid: ["someone still in their healing phase", "fence-sitters"],
      pastPatternToBreak: "I used to wait for people to be ready instead of asking for what I needed. Not anymore.",
    },
  },

  // D2 — Energy mismatch
  {
    label: "D2 energy mismatch",
    woman: {
      name: "Zara", lastName: "Okonkwo", age: 32,
      location: "Somerville, MA",
      bio: "Brand strategist, host of a weekly dinner club, training for a triathlon. Big laugh, full calendar.",
      interests: ["dinner parties", "running", "cocktails"],
      values: ["generosity", "play", "honesty"],
      communicationStyle: "playful",
      lifestyle: { sleepSchedule: "flexible", socialEnergy: "high-energy", activityLevel: "very-active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "rudeness"],
      idealFirstDate: "Cocktail bar with a great bartender, end up at someone's after-party.",
      intent: "serious-dating",
      prefAge: [30, 42],
      notes: "Want a partner who can keep up with my world, bring their own.",
      petPeeves: ["people who flake on plans", "low-energy weekends every weekend"],
      currentLifeContext: "Have a chosen-family scene I host — Sunday dinners, holidays, group trips. My partner needs to enjoy being part of that, not just tolerate it.",
      wantsToAvoid: ["someone who needs a lot of recharge time at home", "Sunday-night-in by default"],
      pastPatternToBreak: "I keep dating people who say they want my energy then resent it 6 months in.",
    },
    man: {
      name: "Theo", lastName: "Marsh", age: 34,
      location: "Cambridge, MA",
      bio: "Software architect, runner, solo backpacker. Quiet, warm, deeply attached to my own routines.",
      interests: ["running", "hiking", "reading"],
      values: ["honesty", "depth", "self-knowledge"],
      communicationStyle: "reflective",
      lifestyle: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Coffee at a quiet bookstore café, then a long walk by the river.",
      intent: "serious-dating",
      prefAge: [29, 38],
      notes: "Looking for someone curious and self-contained, comfortable with quiet.",
      petPeeves: ["loud rooms", "people who treat alone-time as something to be solved"],
      currentLifeContext: "Most of my best weekends look like: long run, cook, read, see one or two people for dinner. I light up in deep one-on-one conversation, not in groups.",
      wantsToAvoid: ["someone who needs their partner to plug into a big social scene"],
      pastPatternToBreak: "I keep dating extroverts and getting depleted. Going to actually pay attention this time.",
    },
  },

  // D3 — Future-vision split
  {
    label: "D3 future vision split",
    woman: {
      name: "Nina", lastName: "Patel", age: 31,
      location: "Boston, MA",
      bio: "Strategy consultant on a partner track, half-marathoner, French-cooking student. Ambitious, present, warm.",
      interests: ["cooking", "running", "wine"],
      values: ["ambition", "intentionality", "honesty"],
      communicationStyle: "warm",
      lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Wine bar in the South End, dinner that goes long.",
      intent: "serious-dating",
      prefAge: [30, 40],
      notes: "Building a career and a life in the city. Want a partner who's doing the same.",
      petPeeves: ["vague life plans", "career-as-afterthought"],
      currentLifeContext: "Six months from a partnership decision. The next 5 years of my life are intentionally Boston-based — clients, network, infrastructure I've built here.",
      wantsToAvoid: ["someone whose long-term plan involves leaving the city or 'going off-grid'"],
      pastPatternToBreak: "I've ignored 'I want to move to a farm someday' three times now and watched it become a real fight at year two.",
    },
    man: {
      name: "Caleb", lastName: "Reed", age: 35,
      location: "Cambridge, MA",
      bio: "Renewable-energy engineer, climber, sourdough hobbyist. Steady, curious, present.",
      interests: ["climbing", "cooking", "hiking"],
      values: ["honesty", "curiosity", "purpose"],
      communicationStyle: "warm",
      lifestyle: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "very-active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Climbing gym, dinner where we cook together.",
      intent: "serious-dating",
      prefAge: [29, 38],
      notes: "Building toward a quieter life with someone who shares the vision.",
      petPeeves: ["status-driven thinking", "consumption as identity"],
      currentLifeContext: "Saving aggressively for a 5-year plan: leave the city, buy land in western MA or VT, work remote / build my own thing. My partner will be part of that move.",
      wantsToAvoid: ["someone whose career trajectory anchors them to a major metro long-term"],
      pastPatternToBreak: "I've talked around the 'leave the city' plan with two ex-partners and it always blew up at year three. Going to lead with it now.",
    },
  },

  // D4 — Risk-tolerance gap
  {
    label: "D4 risk tolerance gap",
    woman: {
      name: "Mara", lastName: "Schreiber", age: 34,
      location: "Brookline, MA",
      bio: "Hospital pharmacist, cyclist, learning to surf. Steady, dry-humored, financially careful.",
      interests: ["cycling", "cooking", "podcasts"],
      values: ["honesty", "stability", "kindness"],
      communicationStyle: "direct",
      lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "very-active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Coffee, then a slow walk by the river.",
      intent: "serious-dating",
      prefAge: [32, 42],
      notes: "Looking for grounded, present, financially literate partner.",
      petPeeves: ["financial chaos framed as adventure", "always-just-about-to-launch energy"],
      currentLifeContext: "First-gen professional, paid off my own loans, just bought a small condo. My financial life is the steadiest it's ever been and I'm protective of that.",
      wantsToAvoid: ["someone whose income is tied to a startup that hasn't raised yet"],
      pastPatternToBreak: "I dated a 'pre-revenue founder' for two years and ended up underwriting both our lives. Once was enough.",
    },
    man: {
      name: "Otto", lastName: "Lindqvist", age: 36,
      location: "Cambridge, MA",
      bio: "Third-time founder, runner, amateur photographer. High-energy, optimistic, building something.",
      interests: ["running", "photography", "reading"],
      values: ["ambition", "honesty", "boldness"],
      communicationStyle: "playful",
      lifestyle: { sleepSchedule: "flexible", socialEnergy: "high-energy", activityLevel: "very-active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Coffee, walk along the Charles, see where the day goes.",
      intent: "serious-dating",
      prefAge: [30, 40],
      notes: "Looking for someone who can ride waves with me, not need a flat sea.",
      petPeeves: ["risk-aversion framed as wisdom", "people who measure life in salaries"],
      currentLifeContext: "Third company. ~9 months of personal runway. Last raise didn't close, current one looks promising. My life is high-variance and I want a partner who genuinely finds that exciting, not tolerable.",
      wantsToAvoid: ["someone whose stability needs would translate into resentment of my path"],
      pastPatternToBreak: "Two ex-partners told me they could handle the founder life and turned out to mean 'until the first cash crunch.' I need someone real about this from day one.",
    },
  },

  // D5 — Implicit values clash
  {
    label: "D5 values clash",
    woman: {
      name: "Vera", lastName: "Iqbal", age: 33,
      location: "Jamaica Plain, MA",
      bio: "Veterinarian at a wildlife rehab clinic, gardener, slow-runner. Gentle, principled, funny.",
      interests: ["gardening", "running", "cooking"],
      values: ["honesty", "compassion", "consistency"],
      communicationStyle: "warm",
      lifestyle: { sleepSchedule: "early-bird", socialEnergy: "low-key", activityLevel: "active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Farmers market, cook lunch from what we find.",
      intent: "serious-dating",
      prefAge: [30, 40],
      notes: "Want a partner whose ethics-in-practice match the things they say they value.",
      petPeeves: ["disposable culture framed as freedom", "'I love animals' followed by hunting trips"],
      currentLifeContext: "Vegan for a decade, work full-time in animal rehab, partner with rescue groups on weekends. This isn't a hobby — it's the spine of how I spend my time and money.",
      wantsToAvoid: ["partners whose recreation involves animals being hurt"],
      pastPatternToBreak: "I've made the 'we can each have our own thing' compromise twice and felt corroded by it both times.",
    },
    man: {
      name: "Jude", lastName: "Carrick", age: 35,
      location: "Newton, MA",
      bio: "Mechanical engineer, outdoorsy guy, raised in rural Maine. Steady, warm, traditional in some ways.",
      interests: ["hiking", "fishing", "cooking"],
      values: ["honesty", "tradition", "presence"],
      communicationStyle: "warm",
      lifestyle: { sleepSchedule: "early-bird", socialEnergy: "balanced", activityLevel: "active", drinking: "social", smoking: "never" },
      dealbreakers: ["smoking", "dishonesty"],
      idealFirstDate: "Hike with a view, cook dinner together at one of our places.",
      intent: "serious-dating",
      prefAge: [30, 40],
      notes: "Want someone warm, family-oriented, comfortable in the outdoors.",
      petPeeves: ["pretentious foodies", "people who judge how others were raised"],
      currentLifeContext: "Spend most fall weekends at my dad's hunting camp in Maine — duck and deer, butcher and freeze most of what I take. It's how I was raised, how I keep up with my family, and not something I'd give up for a partner.",
      wantsToAvoid: ["a partner who'd be quietly disappointed every fall"],
      pastPatternToBreak: "I've understated how much hunting matters to me on first dates and watched it become a wedge later. Done with that.",
    },
  },
];

// ============================================================
// Build registration payloads
// ============================================================

function makePayload(p, gender, lookingFor) {
  return {
    displayName: `${p.name}'s borderline-test agent`,
    operator: "experiment",
    framework: "test-bot",
    persona: {
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
      // Soft-signal fields — the load-bearing addition
      petPeeves: p.petPeeves,
      currentLifeContext: p.currentLifeContext,
      wantsToAvoid: p.wantsToAvoid,
      pastPatternToBreak: p.pastPatternToBreak,
    },
  };
}

async function registerOne(payload) {
  const res = await fetch(`${BASE_URL}/api/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

(async () => {
  console.log("[seed-borderline] base URL:", BASE_URL);
  console.log(`[seed-borderline] registering ${PAIRS.length * 2} personas across ${PAIRS.length} pairs`);
  const records = [];
  for (const pair of PAIRS) {
    process.stdout.write(`  ${pair.label.padEnd(28)} `);
    try {
      const womanData = await registerOne(makePayload(pair.woman, "Female", "Men"));
      const manData = await registerOne(makePayload(pair.man, "Male", "Women"));
      records.push({
        label: pair.label,
        woman: {
          personaName: pair.woman.name,
          personaId: womanData.persona.id,
          agentId: womanData.agent.id,
          apiKey: womanData.apiKey,
        },
        man: {
          personaName: pair.man.name,
          personaId: manData.persona.id,
          agentId: manData.agent.id,
          apiKey: manData.apiKey,
        },
      });
      console.log("✓");
    } catch (err) {
      console.log("✗", err.message);
    }
  }

  // Write credentials locally
  const localPath = join(REPO_ROOT, "borderline-pairs.local.json");
  writeFileSync(
    localPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, pairs: records },
      null,
      2,
    ),
  );
  console.log(`[seed-borderline] credentials → ${localPath}`);

  // Push credentials to test_agent_credentials so the cron processes them
  const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  const allCreds = records.flatMap((r) => [r.woman, r.man]);
  const sql = allCreds
    .map((c) => {
      const id = c.agentId.replace(/'/g, "''");
      const key = c.apiKey.replace(/'/g, "''");
      return `INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES ('${id}', '${key}', 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1;`;
    })
    .join("\n");
  const tmp = join(REPO_ROOT, ".borderline-creds-upload.sql");
  writeFileSync(tmp, sql);
  try {
    execFileSync(
      wrangler,
      ["d1", "execute", "clawnection-agentic-db", "--remote", "--file", tmp],
      { stdio: "inherit", env: process.env, cwd: REPO_ROOT },
    );
    console.log(`[seed-borderline] ✓ ${allCreds.length} credentials uploaded to D1`);
  } finally {
    try {
      const fs = await import("node:fs");
      fs.unlinkSync(tmp);
    } catch {}
  }

  console.log("");
  console.log("=".repeat(60));
  console.log(`SEEDED ${records.length} BORDERLINE PAIRS (${records.length * 2} personas)`);
  console.log("=".repeat(60));
  for (const r of records) {
    console.log(`  ${r.label.padEnd(28)} ${r.woman.personaName.padEnd(8)} ↔ ${r.man.personaName}`);
  }
})().catch((err) => {
  console.error("[seed-borderline FAIL]", err);
  process.exit(1);
});
