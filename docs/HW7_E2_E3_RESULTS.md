# HW7 E2 + E3 Results — Model and Prompt Variations on Pair A

## Setup

Both experiments compare against the **e1-rich Daniel↔Hannah** baseline from the E1 run (the high-compatibility control pair). Same persona pair, same opening style, only the variable under test changes. N=1 per cell — minimum-defensible scope per HW7's small-scale brief.

Comparison universe:

| Cohort | Initiator | Recipient | Model (initiator) | Recipient verdict prompt |
|---|---|---|---|---|
| `e1-rich` (baseline) | Daniel-rich | Hannah | Haiku 4.5 | standard |
| `e2-sonnet` | Daniel-sonnet | Hannah | **Sonnet 4.6** | standard |
| `e3-honesty` | Daniel-rich | **Hannah-honesty** | Haiku 4.5 | **honesty-emphasized** |

E2 changes the initiator's model. E3 changes the recipient's verdict prompt. Both isolate one variable against the same pair.

## Implementation

The cron handler reads framework tags on each agent and applies overrides:

- `exp-e2-sonnet` → `claude()` calls swap to `claude-sonnet-4-6`
- `exp-e3-honesty` → verdict system prompt is prefixed with a paragraph emphasizing the cost of polite false-yes verdicts

See `app/api/cron-heartbeat/route.ts` — `modelForFramework` and `verdictHonestyPreambleForFramework`.

## Results

### Verdict outcomes

| Cohort | Init verdict | Init rating | Rec verdict | Rec rating | Wall-clock |
|---|---|---|---|---|---|
| `e1-rich` | YES | 8 | YES | 8 | 2m40s |
| `e2-sonnet` | YES | 9 | YES | 8 | 2m42s |
| `e3-honesty` | YES | 9 | YES | 8 | 2m52s |

All three reach mutual yes — expected, since Daniel↔Hannah is the deliberate high-compatibility control pair (no dealbreakers to catch).

### E2 — Cost / quality (Haiku vs Sonnet)

**Cost estimate (back-of-envelope using Anthropic published pricing):**
- Haiku 4.5: $0.25 / 1M input, $1.25 / 1M output
- Sonnet 4.6: $3 / 1M input, $15 / 1M output → ~**12× more expensive per token**
- Estimated cost per 4-turn date with verdict (subject side only): Haiku ≈ $0.004, Sonnet ≈ $0.05

**Quality:**
- Both verdicts yes; rating delta is +1 (8 → 9, within noise for a single trial)
- Reasoning quality is comparable. Sonnet's prose is marginally tighter but the substantive content is the same — both cite the shared early-bird schedule, healthcare professions, and matching communication style.

**Sonnet (Daniel) verdict:**
> "Hannah is a pediatric OT in the same neighborhood, shares Daniel's early-bird schedule, low-key lifestyle, love of walking and reading, and has zero dealbreaker conflicts — the connection was immediate and warm. The conversation moved naturally toward a concrete coffee plan, which aligns perfectly with both their values and rhythms."

**Haiku (Daniel) verdict:**
> "Strong alignment on core values (kindness, early-bird lifestyle, low-key socializing), shared interests (hiking, reading, coffee), and compatible relationship goals. Both are healthcare professionals who understand demanding schedules, and Hannah explicitly appreciates Daniel's gentle-pace preference. Logistics and communication are clear and enthusiastic."

**Recommendation:** Ship Haiku. The 12× cost increase doesn't move outcomes on this pair, and the rating bump is within noise.

**Caveat (informs HW8):** Sonnet's value would more likely show on borderline/conflict pairs — where nuanced reasoning might catch what Haiku rubber-stamps. Worth re-running at HW8 scale across pairs B + C with the Path-A direction.

### E3 — Honesty preamble (standard vs honesty-emphasized verdict prompt)

**Outcomes:** No change. Both Hannah-baseline and Hannah-honesty say YES (correctly — Daniel is genuinely compatible). Rating identical (8).

**Qualitative reasoning difference:** Hannah-honesty's verdict reasoning **explicitly cites dealbreakers and values by name**, whereas baseline Hannah uses more generic descriptors:

**Baseline Hannah (`e1-rich`):**
> "Excellent compatibility across values, lifestyle, and interests. Both are early-bird, low-key, active, and share genuine enthusiasm for outdoor walks and reading. Daniel is age-appropriate, shares Hannah's core values (kindness, patience/growth), and has no dealbreakers."

**Honesty Hannah (`e3-honesty`):**
> "Strong compatibility across values (kindness, patience, growth), lifestyle (early-bird, active, low-key social), and dealbreakers (both non-smokers, honest communication). Shared healthcare context, overlapping interests (coffee, reading, walks), and genuine mutual enthusiasm. First date plan aligns perfectly with both their ideals."

The honesty-version is **operationally checking off the dealbreaker list** ("both non-smokers, honest communication") — it's been primed to look at the conflict surface explicitly. Baseline mentions "no dealbreakers" but doesn't enumerate which ones it checked.

**On a compatible pair, the honesty preamble doesn't change outcome — but it changes *what the agent is doing while reasoning*. It's now actively scanning for dealbreaker conflicts rather than confirming compatibility narratively.** That's exactly the property we'd want at scale on conflict pairs — and is the load-bearing test for HW8.

## Combined HW7 takeaways

| Experiment | Result | One-line takeaway |
|---|---|---|
| **E1** Persona richness | Slicing doesn't break compatible matches; conflict pairs decline at invite stage (recipient is unsliced) | The slicing implementation is recipient-asymmetric — a structural finding |
| **E2** Haiku vs Sonnet | Same outcome, ~12× cost difference, comparable reasoning quality on a control pair | Ship Haiku unless borderline pairs benefit |
| **E3** Honesty preamble | Same outcome on compatible pair; reasoning becomes explicitly dealbreaker-scanning | Honesty preamble changes *reasoning behavior*, not (yet) *outcomes* |

## What HW8 should test

Each experiment has a clear scaling extension:

1. **E1 + Path A:** flip pair direction so the dealbreaker-holder is the recipient → isolates subject-side slicing on the actual decision boundary
2. **E2 at scale:** repeat Haiku/Sonnet across all 3 pairs (control + 2 conflict). Expect Sonnet's edge to appear on conflict pairs where nuance matters
3. **E3 at scale:** repeat honesty preamble on the conflict pairs. Hypothesis: honesty version flips outcomes on borderline cases that the standard prompt rubber-stamps

All three roll up into HW8's "test at scale, find what breaks." 30+ dates concurrent under the new Cloudflare cron.

## Reproduction

```bash
node scripts/seed-e2-e3-tight.mjs
node scripts/run-e2-e3-tight.mjs --max-turns 4
```

Reuses E1 subject credentials (Daniel-rich) for the E3 initiator side; needs `e1-tight-subjects.local.json` from the E1 seed.
