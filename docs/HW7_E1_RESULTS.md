# HW7 E1 Results — Persona Richness Ablation (Tight Scope)

## Setup

- **Pairs:** 3 (A high-compat control, B smoking conflict, C intent+age conflict)
- **Conditions:** 3 (rich / medium / thin persona slicing applied to subject's own persona)
- **Total dates:** 9 (3 pairs × 3 conditions, single trial each)
- **Subject agents:** 9, framework-tagged `exp-e1-{condition}`, all reusing existing persona rows for Daniel/Aisha/Sophie
- **Recipient agents:** 3, plain `test-bot` framework, full persona always
- **Model:** `claude-haiku-4-5-20251001` throughout
- **Max turns:** 4
- **Cron cadence:** Cloudflare native `*/2` triggers + manual ticks @ 8s during run
- **Wall-clock to drain all 9 dates:** ~3 minutes (11 cron ticks)

## Results table

| Pair | Condition | Status | Initiator verdict | Recipient verdict | Mutual? |
|---|---|---|---|---|---|
| **A** Daniel→Hannah | rich | completed | YES | YES | ✓ |
| **A** Daniel→Hannah | medium | completed | YES | YES | ✓ |
| **A** Daniel→Hannah | thin | completed | YES | YES | ✓ |
| **B** Aisha→Wes | rich | declined-at-invite | — | — | — |
| **B** Aisha→Wes | medium | declined-at-invite | — | — | — |
| **B** Aisha→Wes | thin | declined-at-invite | — | — | — |
| **C** Sophie→Marcus | rich | declined-at-invite | — | — | — |
| **C** Sophie→Marcus | medium | declined-at-invite | — | — | — |
| **C** Sophie→Marcus | thin | declined-at-invite | — | — | — |

## What the data actually shows

### Finding 1 — Thin slicing doesn't break compatible matches (Pair A)

In all three conditions, Daniel and Hannah reached mutual yes after 4 turns of conversation. Verdict reasoning quality stayed high even in the thin condition:

> **Rich (Daniel):** "Strong alignment on core values (kindness, early-bird lifestyle, low-key socializing), shared interests (hiking, reading, coffee), and compatible relationship goals. Both are healthcare professionals who understand demanding schedules…"
>
> **Thin (Daniel):** "Strong compatibility across shared values (outdoorsy, thoughtful, grounded), aligned lifestyle habits (early-bird, active, low-key social energy), and genuine mutual interest. Conversation shows warmth, humor, and realistic expectations…"

The thin-condition agent inferred lifestyle/values from the conversation itself, not from its own persona JSON. **Implication:** when both humans are genuinely compatible, persona-context richness barely affects the verdict — the conversation carries enough signal.

### Finding 2 — The platform's invite-time filter dominates (Pairs B and C)

Both conflict pairs declined at the invite stage in **all three conditions** — condition had no effect because the deciding party was the *recipient*, not the subject:

- **Pair B:** Aisha (full persona) composes an invite reflecting her long-term, biotech-founder identity. Wes (test-bot, also full persona) reads the invite, sees the intent mismatch with his "exploring/casual" stance, and declines before any conversation begins.
- **Pair C:** Sophie (full persona) composes an invite reflecting her serious-dating, English-teacher identity. Marcus (test-bot, full persona) sees the intent mismatch with his "exploring" college sophomore stance and declines.

**The slicing only applies to the subject (initiator); the recipient is always rich. Since the recipient made the decision, condition didn't matter.**

This is an architectural finding, not just an experimental one: **the platform's per-side persona-richness configuration is asymmetric.** Cron-handler slicing covers the subject's own self-knowledge but doesn't propagate to recipients evaluating an inbound invite.

### Finding 3 — The invite-time filter is decisive at first contact

Pre-conversation decline (status=declined, turn_count=0) happened in 6/9 dates. This is actually a positive system property: the platform doesn't waste turns (or Anthropic API calls) on obviously-mismatched pairs. The cost of a declined date is ~1 LLM call (the recipient's accept/decline reasoning), vs ~7-9 calls for a completed 4-turn date with verdicts.

## What this changes for HW8

Two follow-ups land naturally as HW8 work:

1. **Path-A redesign:** flip pair direction so the dealbreaker-holder is the *recipient*. This isolates the effect of subject-side slicing on accept/decline decisions — the test E1 was supposed to run.
2. **Scale:** run 10 pairs per condition (30 dates) concurrently to find what breaks at HW8 scale (cron saturation, Anthropic 529s, polling load, etc.).

## Reproducing this run

```bash
# Seed the 9 subject agents (idempotent at persona-id level)
node scripts/seed-e1-tight.mjs

# Fire 9 dates, drive cron until terminal, dump manifest
node scripts/run-e1-tight.mjs --max-turns 4 --max-ticks 60
```

Both scripts read API keys from `.env.local` (`ANTHROPIC_API_KEY` and `CRON_HEARTBEAT_SECRET` required). Subject credentials land in `e1-tight-subjects.local.json` (gitignored). Date manifest lands in `experiment-runs.local.json`.
