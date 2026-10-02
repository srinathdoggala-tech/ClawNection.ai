# HW8 — Scaled Experiments (Clawnection)

## What changed since HW7

HW7 ran 11 dates total across 3 small experiments (E1: 9, E2: 1, E3: 1), single-trial per cell, fired sequentially. The headline finding was *architectural*: persona-richness slicing is recipient-asymmetric — the deciding party in HW7's E1 conflict pairs was the recipient (always rich), so condition couldn't matter.

HW8 acts on that finding with two extensions:

1. **Path A redesign** — pair direction flipped for B and C so the dealbreaker-holder is the **recipient**. Their sliced view now controls the accept/decline decision.
2. **Scale + concurrency** — 27 dates fired simultaneously (3 pairs × 3 conditions × 3 trials) instead of HW7's sequential 1-per-cell. Total cloud-agent count grew from 31 → **40** (9 fresh test-bot initiator agents added). Per-tick metrics captured throughout to surface what degrades.

## Scaled setup

| | HW7 | HW8 |
|---|---|---|
| Total dates | 11 | **27** |
| Trials per cell | 1 | **3** |
| Fire pattern | Sequential | **Concurrent (Promise.allSettled)** |
| Cloud agents | 31 | **40** |
| Cron cadence | Cloudflare `*/2` + manual ticks @ 8s | Same |
| Pair direction (B, C) | Subject initiates | **Subject (sliced) is recipient** |

Pairings:

- **A control:** Hannah-fresh#i → Daniel-{rich/medium/thin}
- **B smoking conflict:** Wes-fresh#i → Aisha-{rich/medium/thin}
- **C intent + age conflict:** Marcus-fresh#i → Sophie-{rich/medium/thin}

Each fresh initiator sends 1 invite to each of the 3 condition-tagged recipients = 9 dates per pair × 3 pairs = 27 unique (init, recip) tuples.

## Results

### The experimental finding (Pair C confirms the original hypothesis)

| Pair | rich | medium | thin |
|---|---|---|---|
| **A** Hannah → Daniel (control) | 3/3 mutual yes | 3/3 mutual yes | 3/3 mutual yes |
| **B** Wes → Aisha (smoking conflict) | 3/3 declined-at-invite | 3/3 declined-at-invite | 3/3 declined-at-invite |
| **C** Marcus → Sophie (intent conflict) | **3/3 declined-at-invite** | **3/3 mutual yes** | **3/3 mutual yes** |

**Pair C is the load-bearing result.** Sophie-rich catches the intent mismatch (her `relationship_intent=serious-dating` vs Marcus's `exploring`) and the age preference violation (her `preference_age_min=22` vs Marcus's age 20) at the invite stage — declining all 3 trials. Sophie-medium and Sophie-thin lack visibility into both fields and accept the invite, then complete a 4-turn conversation and verdict yes (8/8 ratings, no concerns flagged).

This is **the original E1 hypothesis confirmed** — the rich-vs-thin separation Path A was designed to surface. **3-trial reproducibility:** 100% within each cell.

**Pair B (smoking)** declined regardless of condition. Aisha catches Wes via signals in his full persona (he's the initiator and his full persona accompanies the invite) — even thin-Aisha, who can't see her own dealbreakers, can read Wes's `lifestyle_habits.smoking="regular"` and decline based on that asymmetric visibility. This is a separate finding: **invite-time evaluation has more information than the receiver's own sliced self-knowledge**, because the sender's persona is always sent in full.

**Pair A (control)** stayed at 9/9 mutual yes across conditions — replicating HW7's finding that thin slicing doesn't break compatible matches.

### Failures and bottlenecks at scale

Per-tick instrumentation captured during the drain:

| Metric | Value |
|---|---|
| Concurrent fire of 27 dates | **2.5s** (Promise.allSettled, no failures) |
| Total drain time | **491s** (~8 min, 28 cron ticks) |
| Cron tick latency — median | **7.8s** |
| Cron tick latency — p95 | **21.2s** |
| Cron tick latency — max | **21.5s** |
| Cron handler errors across all ticks | **37** (mostly transient Anthropic 529s under burst load) |
| Concurrent verdicts in peak tick | 4 |

**Compare to HW7 (small):** HW7's E1 9-date run drained in ~3 min with cron ticks consistently 2-3 sec. **At 3× the dates fired concurrently, cron tick latency degraded ~3-7×, and we saw 37 transient errors** that didn't occur at small scale.

The bottleneck is clear: the cron handler's **per-tick agent batch processes Anthropic API calls serially per agent** (each agent's invite/message/verdict steps are a sequential chain). When many agents land at once, ticks pile up. The */2 Cloudflare cron cadence + 10-agent-per-tick limit creates a hard ceiling: at most 600 agent-events per minute, regardless of demand.

## What I added or improved

1. **Path A direction flip (Pair B, Pair C)** — the runner now puts the dealbreaker-holder on the recipient side. This isolates subject-side slicing on the actual accept/decline decision, fixing the architectural blind spot identified in HW7.
2. **Concurrent fire pattern** — `Promise.allSettled` instead of sequential `for…await`. 27 dates initiated in 2.5s, exposing race conditions and rate-limit behavior the HW7 sequential pattern hid.
3. **Per-tick instrumentation** — `cronElapsedMs`, `totalErrors`, `statusCounts` captured every tick. This is the data that revealed the degradation (median 2-3s → 7.8s; p95 21.2s).
4. **9 fresh initiator agents** seeded (3 each of Wes/Marcus/Hannah personas, framework=test-bot, distinct agent IDs). Each is independently picked up by the cron, demonstrating horizontal-scale handling at the deployment layer.

## Key takeaways

1. **Path A worked.** Pair C produces the rich-vs-thin separation the original E1 design was after — 3/3 vs 0/3 catch rate, perfectly reproducible across trials. The persona-richness ablation is real *when applied to the deciding side*.

2. **At-scale degradation is in the cron handler, not the platform.** Date initiation, D1 writes, and the worker runtime stayed stable. The bottleneck is the cron's serial-per-agent Anthropic API loop. Two possible fixes (out of scope for HW8): parallelize `runOneAgentTick` calls across agents within a tick, or move heavy LLM calls into a separate queue.

3. **Pair B's invariance reveals an information-asymmetry property of the platform:** the sender's persona arrives in full in every invite, regardless of recipient slicing. So a "thin recipient" can still react to rich sender data — the slicing only affects what the recipient knows about *themselves*. This wasn't visible in HW7 because that direction never had the recipient evaluate the invite.

4. **Concurrent invites surface latent transient failures:** 37 errors over 28 ticks (~1.3/tick) vs zero at HW7's smaller, sequential scale. Most appeared to be Anthropic 529s under burst load. None caused permanent failures — all 27 dates eventually reached terminal status.

## Cloud-instance footprint

- 40 active cloud agents on Cloudflare Workers (≥30 floor cleared by 33%)
- Worker handles `fetch()` + `scheduled()` + D1 + self-fetch bindings
- 9 fresh agents seeded specifically for this scale run

## Reproduction

```bash
node scripts/seed-hw8-initiators.mjs   # 9 fresh test-bot agents
node scripts/run-hw8.mjs --max-turns 4 --max-ticks 80
```

Reads recipient credentials from `e1-tight-subjects.local.json` (HW7) and initiator credentials from `hw8-initiators.local.json`. Manifest with per-tick metrics lands in `hw8-runs.local.json` (gitignored).
