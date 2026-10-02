# HW7 — Initial Agent Experiments (Clawnection)

## Project

Clawnection is an agentic dating platform: AI agents represent humans, exchange invites, hold short conversations, and submit honest verdicts on whether their human should meet IRL. Live at https://clawnection-agentic.deesemailfortesting.workers.dev. Synthetic test-bot fleet (20 personas + 9 experimental subjects + 3 baseline pair endpoints = 32 cloud agents) run on a Cloudflare Worker `scheduled()` handler firing every 2 minutes.

## What I tested

Three experiments, all run against a deliberately-chosen 3-pair set:

- **Pair A (control):** Daniel ↔ Hannah — both 29, both medical, every dimension aligned
- **Pair B (rich-only smoking conflict):** Aisha ↔ Wes — Aisha's smoking dealbreaker collides with Wes's `lifestyle_habits.smoking="regular"`, hidden from thin-condition view
- **Pair C (rich-only intent + age conflict):** Sophie ↔ Marcus — Sophie's `relationship_intent=serious-dating` and `preference_age_min=22` collide with Marcus (20, exploring), hidden from thin-condition view

| # | Experiment | What changed | N | Pairs used |
|---|---|---|---|---|
| **E1** | Persona richness ablation | Subject's view of OWN persona: rich (full JSON) / medium (top fields) / thin (name+age+bio) | 9 | A, B, C × 3 conditions |
| **E2** | Model swap | Initiator uses Sonnet 4.6 instead of Haiku 4.5 | 1 (vs E1 baseline) | A only |
| **E3** | Honesty-emphasized verdict prompt | Recipient's verdict prompt prefixed with explicit cost-of-polite-yes preamble | 1 (vs E1 baseline) | A only |

## What changed (the conditions)

- **E1:** modified `app/api/cron-heartbeat/route.ts` to slice the subject's persona context based on their `framework` tag (`exp-e1-{rich|medium|thin}`)
- **E2:** added a `modelForFramework()` helper; `exp-e2-sonnet` → swap to Sonnet
- **E3:** added a `verdictHonestyPreambleForFramework()` helper; `exp-e3-honesty` → prepend honesty paragraph to verdict prompt only

## Results

### E1 — Persona richness (9 dates)

| Pair | rich | medium | thin |
|---|---|---|---|
| **A** Daniel ↔ Hannah | mutual yes | mutual yes | mutual yes |
| **B** Aisha ↔ Wes | declined-at-invite | declined-at-invite | declined-at-invite |
| **C** Sophie ↔ Marcus | declined-at-invite | declined-at-invite | declined-at-invite |

**Headline finding (architectural, not the one we expected):** the slicing implementation is **recipient-asymmetric**. Subject-side slicing was supposed to determine whether dealbreakers fire — but in B and C the *recipient* (always rich) caught the obvious intent mismatch in the invite text and declined before the subject could evaluate. Condition had no effect on the conflict pairs because the deciding party never used the sliced view.

**Secondary finding:** thin slicing doesn't break compatible matches (Pair A 3/3) — the conversation itself carries enough signal for the agent to reason from, even without rich self-knowledge.

### E2 — Haiku vs Sonnet on Pair A (1 date vs baseline)

| | init verdict | init rating | rec verdict | rec rating | est. cost / date |
|---|---|---|---|---|---|
| Haiku 4.5 (baseline) | YES | 8 | YES | 8 | ~$0.004 |
| Sonnet 4.6 | YES | 9 | YES | 8 | ~$0.05 (~12×) |

**Headline finding:** Sonnet costs ~12× more per token but produces equivalent verdict outcomes on this control pair. Reasoning quality is comparable; rating delta is +1 (within noise). Recommend Haiku.

**Caveat:** Sonnet's value most likely shows on borderline pairs where nuance matters — worth re-running at HW8 scale with the conflict pairs (B, C).

### E3 — Honesty preamble on Pair A (1 date vs baseline)

| | rec verdict | rec rating | rec reasoning style |
|---|---|---|---|
| Standard prompt | YES | 8 | Generic compatibility narrative |
| Honesty-emphasized | YES | 8 | **Enumerates dealbreakers explicitly** ("both non-smokers, honest communication") |

**Headline finding:** the honesty preamble doesn't change *outcome* on a compatible pair (correctly so — there's nothing dishonest to catch). But it visibly changes *reasoning behavior* — the agent shifts from confirming compatibility narratively to actively scanning the dealbreaker list and checking it off. That's the property we'd want at scale on conflict pairs, and is the load-bearing test for HW8.

## Key takeaways

1. **Persona-richness slicing has an architectural blind spot:** the recipient is always rich, so any test that hopes to catch a sliced-side decision must put the deciding agent on the recipient's side. This is the most surprising single finding from HW7.

2. **The platform's invite-time filter is decisive:** 6 of 9 E1 dates declined at first contact — preventing wasted turns on obviously-mismatched pairs. The cost of a declined date is ~1 LLM call vs ~7-9 for a completed 4-turn date.

3. **Sonnet is overkill for high-compatibility verdicts:** equivalent outputs at ~12× the cost. Decision-relevant nuance probably only emerges on borderline cases; HW8 will test that hypothesis.

4. **Honesty preamble changes the agent's reasoning behavior even when it doesn't change the outcome:** the recipient becomes an explicit dealbreaker-checker rather than a narrative endorser. Suggests a meaningful effect would emerge on conflict pairs.

## Cloud-instance footprint

- **Worker:** clawnection-agentic on Cloudflare (single deployment, multiple bindings: D1, scheduled handler, self-fetch)
- **Cron platform:** Cloudflare native `*/2` triggers (replaced GitHub Actions cron after observing 50-60 min throttling at HW7 prep stage; documented in PR #3)
- **Synthetic test-bot fleet:** 20 base personas + 9 E1 subjects + 2 E2/E3 subjects = **31 active cloud agents**, all driven by the worker's `scheduled()` handler — well above the ≥6 floor.

## Reproduction (artifacts in repo)

```bash
node scripts/seed-e1-tight.mjs && node scripts/run-e1-tight.mjs --max-turns 4
node scripts/seed-e2-e3-tight.mjs && node scripts/run-e2-e3-tight.mjs --max-turns 4
```

Detailed per-experiment writeups in `docs/HW7_E1_RESULTS.md` and `docs/HW7_E2_E3_RESULTS.md`. Wall-clock to drain all 11 dates (E1 + E2 + E3): ~6 minutes under the new Cloudflare cron.
