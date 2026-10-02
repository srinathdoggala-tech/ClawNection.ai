# Clawnection Architecture Notes

This document turns the product direction in issue #12 into a concrete system shape.

## Purpose

Clawnection should be designed as three distinct layers:

1. signal extraction
2. compatibility modeling
3. agent negotiation

The goal is to avoid collapsing ingestion, scoring, and agent behavior into one opaque matching system.

## Design principles

- Each layer has explicit inputs and outputs.
- Behavioral evidence should be separated from downstream interpretation.
- Private user data should remain in the smallest possible scope.
- The system should support directional compatibility, not only a shared similarity score.
- The MVP should start with chat-first ingestion before broader data-source expansion.

## Layer 1: Signal extraction

### Responsibility

Turn raw user-consented data into structured behavioral signals.

This layer does not decide whether two people are compatible. It only extracts observable evidence.

### MVP input sources

The first MVP should prioritize exported chat data from:

- WhatsApp
- iMessage

Later sources can include:

- calendar
- location history
- email
- AI chat logs
- device metadata

### Example chat-derived signals

- response latency distribution
- initiation ratio
- average message length and thread depth
- mirroring tendency
- emoji and punctuation fingerprint
- conflict register
- sentiment trajectory across long threads
- stability of close-contact graph over time

### Layer 1 input/output contract

Input:
- raw user-consented source exports

Output:
- normalized signal records
- source provenance metadata
- confidence or coverage metadata when extraction is incomplete

### Explicit non-goals

- no direct compatibility score
- no recommendation to meet or not meet
- no raw data sharing with another user's agent

## Layer 2: Compatibility modeling

### Responsibility

Turn extracted signals plus user-stated preferences into matchable attributes and directional fit judgments.

This layer interprets evidence. It does not negotiate on behalf of the user.

### Core trait clusters

- communication style
- attachment and intimacy patterns
- life tempo
- values inferred from behavior
- ambition shape
- self-awareness gap

### Modeling rules

- support directional scoring: person A's fit for person B can differ from person B's fit for person A
- support per-trait handling of similarity versus complementarity
- keep self-awareness-gap features internal to the model unless product policy changes explicitly allow exposure

### Layer 2 input/output contract

Input:
- structured behavioral signals from Layer 1
- user-stated preferences and dealbreakers
- policy constraints on what may be surfaced

Output:
- private compatibility vectors
- directional fit assessments
- negotiable summaries that can be used by agents
- recommendation ingredients, but not the final agent conversation itself

### Explicit non-goals

- no raw source evidence exchange
- no uncontrolled exposure of sensitive inferred traits
- no single universal score that replaces trait-level reasoning

## Layer 3: Agent negotiation

### Responsibility

Let two user agents probe compatibility using constrained summaries and targeted questions.

This layer is where matchmaking behavior happens.

### Core ideas

- agents reason with a private representation and a shareable representation
- agents do not dump full profiles to each other
- negotiation should happen through scoped questions about fit
- outcomes should preserve directional compatibility rather than flattening everything into one number

### Example negotiation prompts

- my person needs someone who plans ahead; how does yours handle plans made weeks in advance?
- my person values direct repair after conflict; how does yours behave after tension in close relationships?
- my person does best with consistent communication; how reliable is yours across normal busy periods?

### Layer 3 input/output contract

Input:
- private compatibility vector
- shareable summary
- user preference constraints
- policy boundaries on what may be revealed

Output:
- structured negotiation trace
- strengths and concerns
- recommendation rationale
- final recommendation and first-date framing for the product UI

### Explicit non-goals

- no access to raw personal data from another user's sources
- no policy bypass for sensitive inferences
- no unconstrained autonomous disclosure

## Privacy boundaries

### User-visible trust model

- a user's agent may process their consented data on their behalf
- other agents should only see approved summaries and answers generated from policy-safe representations
- humans at the company should not need raw message content to operate the product in its intended design

### Required policy lists

Before model training or live inference, define two explicit lists:

1. infer-but-never-surface
2. never-infer

Candidates for strict handling include:

- mental health status
- financial precarity
- fertility and family-history signals
- any highly sensitive protected-class inference not essential to matching

## MVP sequencing

### Phase 1

- document architecture boundaries
- define consent architecture
- build chat-first ingestion

### Phase 2

- extract communication and attachment signals
- define directional compatibility traits
- prototype agent negotiation prompts and summaries

### Phase 3

- expand structured onboarding fields
- add better seed data and evaluation fixtures
- consider persistence and broader data sources

## Open questions

- What chat export format should become the canonical internal ingestion format?
- Which signals are robust enough for MVP scoring versus later experimentation?
- Which traits should favor similarity versus complementarity by default?
- How should policy enforcement be represented in code so every layer respects the same disclosure rules?

## Relationship to the current prototype

The current repo remains a deterministic, local-only MVP. This document does not change the implementation constraints in [PROJECT_SPEC.md](../specs/PROJECT_SPEC.md). It defines the target architecture so future work can evolve toward a layered system without mixing extraction, scoring, and negotiation concerns.