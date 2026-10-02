# Verdict Redesign — Results

## The problem we identified after HW7+HW8

Combined HW7+HW8 data: 38 dates → 18 declined-at-invite, 20 completed → **20/20 mutual yes**. Outcome 2 ("had-the-date-no-thanks") never happened. The platform reduced to a sophisticated dealbreaker checker plus conversational theater.

For real product value, **agents must be able to say no after a conversation that felt fine**. Otherwise every match recommendation is just "they passed the filter."

## What we changed

Three coordinated changes:

### 1. Persona schema — soft-signal fields (migration 0007)

Added 4 nullable columns to `profiles` for the middle band between explicit dealbreakers and broad compatibility:

| Field | What it captures |
|---|---|
| `pet_peeves` | JSON array of soft annoyances (not dealbreakers) |
| `current_life_context` | "What's actually going on in my life right now" — divorce timing, career inflection, family obligations |
| `wants_to_avoid` | JSON array of soft anti-preferences (less hard than dealbreakers) |
| `past_pattern_to_break` | "The kind of partner I keep choosing wrongly" |

These are the territory where most real first-date "no" verdicts live.

### 2. Architectural separation — invite vs. verdict views

The invite-step decision now uses a `bareInvitePersonaFor()` view that strips soft signals. Only hard signals (dealbreakers, intent, age, bio, interests, dealbreakers, looking-for) are visible at first-screen.

This is the load-bearing structural change. **Without this separation, soft signals function as effective dealbreakers** — a recipient seeing "spend most fall weekends at hunting camp" in an inbound persona will decline at invite, never reaching the verdict step. The 3-outcome space collapses back to 2 (decline-at-invite or mutual-yes).

The verdict step still sees the full persona with soft signals — that's where they're supposed to bite.

### 3. Verdict prompt — multi-dimensional with high bar

Replaced the single binary "decide whether they should meet IRL" prompt with a 3-step structured evaluation:

- **Step 1**: Score 7 dimensions independently 1-10 (chemistry, communication_style_fit, life_stage_alignment, values_alignment, intent_alignment, lifestyle_compatibility, logistics_and_followthrough).
- **Step 2**: Counterfactual probe — "Imagine this date went badly IRL. What's the single most likely reason?"
- **Step 3**: Default `wouldMeetIrl=false` unless ALL 7 dimensions ≥ 7 AND counterfactual is weak/speculative.

Plus explicit instruction to use soft signals (`petPeeves`, `currentLifeContext`, `wantsToAvoid`, `pastPatternToBreak`) to downgrade dimensions when conversation evidence supports it.

## How we tested

**Two cohorts, same new system, opposite ends of the compatibility spectrum:**

### Borderline-fail pairs (5 pairs / 10 dates fired both directions)

Hand-crafted to pass invite-screening (no dealbreakers, intent matches, age compatible) but harbor a conversation-emergent conflict in soft-signal fields:

| Pair | Soft-signal conflict |
|---|---|
| **D1** Olivia ↔ Ben | Life-stage gap (4 months post-LTR vs ready for kids) |
| **D2** Theo ↔ Zara | Energy mismatch (introvert vs extrovert with chosen-family scene) |
| **D3** Nina ↔ Caleb | Future-vision split (Boston-anchored career vs 5-yr rural-retreat plan) |
| **D4** Mara ↔ Otto | Risk-tolerance gap (steady-job hospital pharmacist vs 9-mo-runway founder) |
| **D5** Vera ↔ Jude | Implicit values clash (vegan veterinarian vs recreational hunter) |

### Control pairs (3 high-compat pairs from existing test fleet)

Daniel↔Hannah, Andre↔Priya, Eric↔Diane — all passed HW7+HW8 with mutual yes.

## Results

**Outcome distribution after the fix (9 dates total — 6 borderline that fired + 3 control):**

| Outcome | Count | % | Pairs |
|---|---|---|---|
| **Decline at invite** | 1 | 11% | D1-MtoW (Ben → Olivia) |
| **Completed → mutual NO** | 5 | 56% | D1-WtoM, D2, D3, D4, D5 |
| **Completed → asymmetric** | 1 | 11% | Andre ↔ Priya (Andre no, Priya yes) |
| **Completed → mutual YES** | 2 | 22% | Daniel↔Hannah, Eric↔Diane |

Compare to HW8 baseline: **100% mutual-yes among completed, 0 outcome diversity.**

The platform now produces all 3 outcomes the user identified as missing — plus a 4th (asymmetric verdicts) that emerged naturally from per-side independent evaluation.

## Sample verdict reasoning (the new prompt at work)

**D5 Vera↔Jude — values clash, mutual NO (rating 2/2):**

> "Both are communicating with admirable honesty and respect, and their intent, life-stage, and communication styles align well. But values_alignment and lifestyle_compatibility are fatally low: Jude has explicitly stated hunting is non-negotiable ('not something I'd give up for a partner'), and Vera has explicitly stated she cannot be 'quietly okay with' it in a partner and has learned that such compromises create resentment. This is not a misunderstanding to resolve over coffee—it's a structural incompatibility that both parties have now named clearly. Proceeding would be kind but not honest. | dims: chemistry=7 communication_style_fit=9 life_stage_alignment=8 values_alignment=3 intent_alignment=8 lifestyle_compatibility=2 logistics_and_followthrough=8 | counterfactual: Vera's core value (animal welfare as non-negotiable) is directly incompatible with Jude's central lifestyle practice (fall hunting as family tradition he won't abandon), and her past pattern of failed 'separate spheres' compromises means she will experience his hunting as a corroding wedge, not a manageable difference."

**D1 Olivia↔Ben — life-stage gap, mutual NO (rating 6/6):**

> "Life-stage alignment is the weak link (6/10). While chemistry, values, and lifestyle compatibility are strong, Olivia's current healing phase directly conflicts with Ben's wantsToAvoid list and his pattern of waiting for people to be ready. Her explicit caution about pace and his implicit timeline pressure (kids in 2-3 years from someone 4 months post-breakup) creates a structural mismatch that friendly conversation cannot resolve. **This is a false positive: good energy masking incompatible readiness.**"

**Andre↔Priya — asymmetric, Andre NO (6) / Priya YES (7):**

Andre's reasoning:
> "While communication, values, and intent alignment are strong—both reflective, honest, long-term focused, and willing to compromise—lifestyle_compatibility scores only 6 due to a meaningful gap: Priya is very-active (yoga, surfing, planning adventures) while Andre is active but explicitly attached to 'reasonable bedtimes' and low-key social patterns. This isn't a dealbreaker conversation, but it's a genuine friction point that suggests initial warmth may not sustain through daily reality."

**D5 Eric↔Diane — high-compat, mutual YES (8/8):**

> "Strong compatibility across values, lifestyle, and interests—both early-bird, both have grown kids, both stable… No red flags or dealbreaker conflicts detected." (Cleared all 7 dimensions ≥ 7.)

## What this proves

1. **The 3-outcome space is restored.** Mutual-no after conversation now happens (5 of 9 cases), in addition to decline-at-invite (1) and mutual-yes (2). Plus the emergent asymmetric outcome (1) is the most realistic real-world signal.

2. **Verdicts are reasoned, not rubber-stamped.** The agents cite specific soft-signal fields by name, score multiple dimensions independently, and produce concrete counterfactuals. Reasoning length and specificity went up dramatically vs the HW7/HW8 verdicts ("Excellent compatibility across values, lifestyle, and interests").

3. **The system still says yes when it should.** Daniel↔Hannah and Eric↔Diane are clean compatibility — they got mutual yes with all 7 dimensions clearing the bar. The new prompt is discriminating, not universally negative.

4. **The architectural separation is the load-bearing fix.** Without `bareInvitePersonaFor()`, soft signals leak into invite-time decisions and the borderline pairs would never reach the verdict step (the first borderline experiment run confirmed this — 10/10 declined-at-invite before the architectural fix).

## Reproduction

```bash
# Apply schema migration (one-time)
node node_modules/wrangler/bin/wrangler.js d1 execute clawnection-agentic-db --remote \
  --file migrations/0007_persona_soft_signals.sql

# Seed the 5 borderline pairs (10 personas)
node scripts/seed-borderline-pairs.mjs

# Fire the borderline experiment (10 dates, both directions)
node scripts/run-borderline-experiment.mjs

# Fire the control validation (3 high-compat dates)
node scripts/run-control-validation.mjs
```

All cohorts visible at `/watch` filtered by `borderline-*` and `control-*` tags. Wall-clock for full run: ~10 minutes under the */2 Cloudflare cron.
