# Clawnection Agent Negotiation Protocol

This document turns issue #16 into an implementation-facing protocol spec for agent-to-agent matchmaking.

It defines how two user agents should reason about fit using constrained summaries and targeted questions, without exposing raw personal data or policy-blocked inferences.

## Purpose

The negotiation layer takes compatibility outputs and turns them into an interactive matchmaking process.

Its job is to:

- ask the right compatibility questions between agents
- preserve the boundary between private reasoning and shareable information
- probe uncertainty rather than dumping full trait vectors
- produce strengths, concerns, and recommendation rationale in a structured way

## Core principles

- agents reason privately but disclose narrowly
- protocol messages should be structured, not free-form by default
- negotiation should reduce uncertainty in high-impact areas
- blocked topics must remain blocked throughout the protocol
- the protocol must preserve directional fit rather than flattening both users into one shared score

## Inputs to negotiation

Each agent enters negotiation with:

- a private compatibility vector
- a directional fit profile for the other person
- policy constraints
- approved shareable summary candidates
- blocked topics and private-only features

The protocol must not require:

- raw messages
- raw extraction outputs
- private-only model features to be disclosed

## Two-tier representation

Each agent should carry two different representations of its user.

### Private representation

Used internally by the agent.

May include:

- private compatibility vector
- internal risk flags
- confidence-weighted reasoning state
- infer-but-never-surface features if policy allows internal use

Must not be disclosed directly to another agent.

### Shareable representation

Used during negotiation.

May include:

- behavior-framed strengths
- behavior-framed concerns
- approved summary candidates
- question prompts tied to compatibility uncertainty

Must exclude:

- raw messages
- blocked topics
- private-only features
- diagnosis-style language

## Protocol goals

The negotiation should answer:

- where fit looks strong in both directions
- where fit is asymmetric
- which uncertainties are worth probing
- whether any hard constraints block the match
- whether the remaining uncertainty is acceptable for a recommendation

## Protocol phases

### Phase 1: Handshake

Goal:

- establish protocol version, policy boundaries, and allowed disclosure scope

Required payload:

- protocol version
- supported message types
- policy capabilities
- blocked topic categories

Output:

- confirmed negotiation session

### Phase 2: Summary exchange

Goal:

- exchange minimal safe summaries before asking targeted questions

Allowed content:

- communication-style summaries
- life-tempo summaries
- explicit preference constraints
- top-level dealbreaker disclosures only when policy-safe and necessary

Not allowed:

- raw evidence
- hidden internal model state
- humiliating or diagnostic descriptions

### Phase 3: Directed questioning

Goal:

- resolve the highest-value uncertainties using structured questions

Question selection should prioritize:

- high-impact cluster mismatches
- low-confidence but important fit areas
- directional asymmetry
- hard constraint clarification

Example prompts:

- my user needs dependable follow-through for advance plans; how should I interpret your user's planning consistency?
- my user does best with direct repair after tension; how does your user's style look in that area?
- my user values steady communication cadence; is your user's rhythm closer to consistent or bursty?

### Phase 4: Synthesis

Goal:

- convert the protocol exchange into a structured outcome

Required outputs:

- strengths
- concerns
- unresolved uncertainties
- recommendation rationale
- recommendation candidate

### Phase 5: Recommendation packaging

Goal:

- prepare a final recommendation object for the product layer

Required outputs:

- verdict: `meet`, `maybe`, or `not-recommended`
- rationale summary
- human decision reminder
- suggested first-date framing when applicable

## Message types

The protocol should prefer explicit typed messages.

### `handshake`

Fields:

- `protocolVersion`
- `policyVersion`
- `supportedMessageTypes`
- `blockedTopicClasses`

### `summary`

Fields:

- `summaryKey`
- `summaryText`
- `clusterKey`
- `confidence`
- `direction`

### `question`

Fields:

- `questionId`
- `clusterKey`
- `questionText`
- `reason`
- `priority`

### `answer`

Fields:

- `questionId`
- `answerText`
- `confidence`
- `sourceType`: `summary-derived`, `policy-limited`, or `insufficient-evidence`

### `concern`

Fields:

- `concernKey`
- `concernText`
- `severity`
- `direction`

### `strength`

Fields:

- `strengthKey`
- `strengthText`
- `confidence`
- `direction`

### `recommendation`

Fields:

- `verdict`
- `rationale`
- `confidence`
- `openQuestions`

## Directionality in protocol behavior

The protocol should preserve directional reasoning explicitly.

That means an agent may conclude:

- strong fit from A to B
- mixed fit from B to A

and should be able to surface that asymmetry in a safe way.

Example:

- A may be a good fit for B's communication needs, while B may be weaker on A's consistency needs

The protocol must not compress this prematurely into one mutual score.

## Question selection rules

Questions should be selected using a priority order.

### Highest priority

- potential hard blocks
- high-severity directional mismatch
- low-confidence areas with large impact on recommendation

### Medium priority

- cluster-level ambiguity where an answer could upgrade `maybe` to `meet`
- notable asymmetry in communication or planning style

### Lower priority

- cosmetic differences that do not strongly affect match viability

Rule:

- do not ask a question unless the answer can materially change recommendation quality or explanation quality

## Policy enforcement in negotiation

The protocol layer must enforce policy, not assume upstream filtering is enough.

Required behavior:

- reject messages that reference blocked topic classes
- redact or refuse answers that would expose private-only features
- allow graceful fallback answers such as `insufficient-evidence` or high-level abstractions

Example fallback:

- instead of exposing a sensitive internal flag, answer with a high-level concern such as `communication rhythm may need clarification`

## Confidence and uncertainty handling

Every summary, answer, strength, concern, and recommendation should carry explicit confidence.

Negotiation should also track unresolved uncertainty.

Required fields for unresolved uncertainty:

- `uncertaintyKey`
- `clusterKey`
- `impact`
- `reason`

This helps distinguish:

- `not-recommended because clear mismatch`
- `maybe because high-impact uncertainty remains`

## Recommendation logic

The protocol should map outcomes into one of three recommendation classes.

### `meet`

Use when:

- no hard blocks are present
- strong or acceptable fit exists in both directions
- remaining uncertainty is limited and manageable

### `maybe`

Use when:

- no hard block exists, but one or more important uncertainties remain
- directional fit is promising but incomplete
- key mismatch areas may still be workable with clarification

### `not-recommended`

Use when:

- hard blocks exist, or
- directional mismatch is strong enough that negotiation does not resolve it

## First-date framing output

If the recommendation is `meet` or `maybe`, the protocol may emit a lightweight date framing suggestion.

Examples:

- low-pressure setting for communication-rhythm calibration
- structured plan for high planner / lower planner pairings
- quieter setting for lower-overload communication styles

This output should be:

- supportive
- non-prescriptive
- derived from safe explanation ingredients

## Example protocol fragment

```json
{
  "question": {
    "questionId": "q_12",
    "clusterKey": "communication_fit",
    "questionText": "My user values direct repair after tension. How should I interpret your user's post-conflict communication style?",
    "reason": "high-impact uncertainty in conflict repair fit",
    "priority": "high"
  },
  "answer": {
    "questionId": "q_12",
    "answerText": "Available evidence suggests your user would usually get direct follow-up rather than prolonged silence, though coverage is moderate.",
    "confidence": "medium",
    "sourceType": "summary-derived"
  }
}
```

## Non-goals

- no raw evidence exchange
- no open-ended unrestricted model conversation between agents
- no disclosure of blocked or private-only features
- no replacement of human decision-making

## Open questions

- Which protocol messages should be mandatory versus optional in the MVP?
- How many directed questions should be allowed before synthesis to keep the exchange bounded?
- Which unresolved uncertainties should force `maybe` instead of `meet`?
- Should negotiation traces be stored verbatim, summarized, or discarded after synthesis?