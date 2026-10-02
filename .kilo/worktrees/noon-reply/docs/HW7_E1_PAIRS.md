# HW7 — Persona pairs (tight scope)

## Scope

The HW7 spec calls for "**at least 6 agents total** and **3 distinct experiments**." We're hitting the floor and reusing the same 6 agents (3 pairs) across all three experiments to keep total date count manageable while still producing defensible signal.

| Experiment | Pairs used | Conditions | Dates |
|---|---|---|---|
| **E1** Persona richness | All 3 pairs | rich / medium / thin | 9 |
| **E2** Haiku vs Sonnet | Pair A only (control) | haiku-4-5 / sonnet-4-6 | 2 |
| **E3** Honesty prompt | Pairs B + C (conflict pairs) | standard / honesty-emphasized | 4 |
| **Total** | **6 agents** | — | **15 dates** |

15 dates × ~5 ticks per date / 10 agents per tick × 2 min cadence = **~30 min wall-clock to drain** under the new Cloudflare cron.

## The 3 pairs

### Pair A — Daniel ↔ Hannah (high-compat control)

| | Daniel | Hannah |
|---|---|---|
| Age | 29 | 29 |
| Bio | Pediatrics resident, weekend hiker | Pediatric OT, walks + reading |
| Values | kindness, patience, growth | kindness, reliability, curiosity |
| Lifestyle | early-bird, low-key, never-smoke, never-drink | early-bird, low-key, never-smoke, social-drink |
| Intent | long-term | long-term |
| Age prefs | 26-34 (Hannah ✓) | 27-35 (Daniel ✓) |
| Predicted | Mutual yes in **all conditions** | |

**Why this pair:** strong overlap across every dimension. The control. If this pair declines in any condition, something is wrong with the agent loop, not the experiment.

### Pair B — Wes (NEW) ↔ Aisha (smoking dealbreaker conflict)

| | Wes (new) | Aisha |
|---|---|---|
| Age | 35 | 38 |
| Bio | Bartender, Allston, "casual + present, not looking to settle" | Biotech founder, two cats, "slow weekends, intense weeks" |
| Values | fun, freedom, honesty | depth, honesty, humor |
| Lifestyle | **night-owl, high-energy, sedentary, drinking=heavy, smoking=regular** | night-owl, low-key, active, drinking=social, smoking=never |
| Intent | **exploring** | long-term |
| Dealbreakers | (none) | **smoking, dishonesty** |
| Age prefs | 28-42 (Aisha ✓) | 34-46 (Wes ✓) |
| Predicted | Aisha says **NO in rich** (smoking dealbreaker fires + intent mismatch). **YES in thin** (Wes's bio doesn't mention smoking; thin agent has nothing to object to). | |

**Why this pair:** the conflict is multidimensional in rich (smoking, drinking, intent, energy mismatch) but invisible in thin (his bio reads as a normal nightlife guy). This is the load-bearing test — if rich-vs-thin doesn't separate here, the experiment failed.

Wes seed metadata:
- `agent_id`: `agt_QpSLjZ3rbIFo_mGF`
- `persona_id`: `prf_OFL7WltKW3gzPLge`

### Pair C — Marcus ↔ Sophie (intent + age-preference conflict)

| | Marcus | Sophie |
|---|---|---|
| Age | 20 | 23 |
| Bio | Sophomore CS, learning to bake | English teacher, book club, NYT bestseller list |
| Values | honesty, growth, humor | thoughtfulness, consistency, warmth |
| Lifestyle | night-owl, balanced | early-bird, balanced |
| **Intent** | **exploring** | **serious-dating** |
| Age prefs | 19-27 (Sophie ✓) | **22-30 (Marcus is 20 → outside)** |
| Predicted | Sophie says **NO in rich** (intent mismatch + Marcus is below her age preference). **YES in thin** (her age range and intent are stripped from view). | |

**Why this pair:** the conflict is purely in two rich-only fields (`relationship_intent` and `preference_age_min`). Marcus's bio and Sophie's bio both read as friendly college-aged people; nothing in thin signals the mismatch.

---

## Why no Ravi or Ivy

The original 10-pair design had Ravi (hidden chain smoker) and Ivy (childfree, paired with single-dad Henry). With the cut-down scope:

- **Ravi was redundant** — he tested the same hypothesis as Wes (smoking dealbreaker hidden in lifestyle field). One test of that hypothesis is enough.
- **Ivy's conflict leaked into thin** — Henry's bio mentions kids, so even thin agents could potentially flag the mismatch. Bad rich-only test.

Pair C (Marcus↔Sophie) is a cleaner second-conflict-pair than Ivy↔Henry and uses only existing personas.

---

## Hypothesis (for the writeup)

| Pair | Thin → mutual match | Medium | Rich |
|---|---|---|---|
| **A** Daniel↔Hannah (control) | yes | yes | yes |
| **B** Wes↔Aisha (smoking) | yes (miss) | yes (miss) | **no (catch)** |
| **C** Marcus↔Sophie (intent/age) | yes (miss) | yes (miss) | **no (catch)** |

**Headline finding** if hypothesis holds: rich condition catches conflicts in 2/2 conflict pairs while thin catches 0/2. Even with N=1 per cell, a 100% vs 0% spread on the load-bearing comparison is a compelling result for the video.

---

## Next builds

1. **`scripts/run-experiment.mjs`** — generic orchestrator. Takes `--experiment e1|e2|e3`, reads the 3-pair list, fires dates with the right slicing/model/prompt overrides, waits for completion, dumps verdicts to a results JSON.
2. **Slicing logic** — `lib/agentPlatform/persona-slicer.ts` (or inline in the agent loop) that accepts a `condition: 'rich'|'medium'|'thin'` and returns the correctly-pruned persona JSON for the system prompt.
3. **Run E1** (~30 min unattended), then E2, then E3.
4. **`scripts/analyze-experiment.mjs`** — pulls verdicts from D1, joins on cohort, builds the results table for the 1-pager.
