# Clawnection Consent And Inference Policy

This document turns issue #17 into an implementation-facing policy artifact.

It defines:

- what user consent must cover
- what the system may process internally
- what may be shared between agents
- what must never be inferred or surfaced

## Purpose

Clawnection relies on intimate behavioral data. That only works if the trust model is explicit and enforceable.

The product promise should be:

- your agent works for you
- your raw personal data is not exposed to another user's agent
- only policy-safe summaries and answers may leave your private processing boundary

## Core policy principles

- consent must be specific to each data source
- behavioral evidence and shareable output must be separated
- inference power does not imply permission to surface the result
- sensitive traits require stricter handling than ordinary compatibility signals
- the narrowest viable data scope should be preferred for MVP work

## Consent model

### Source-by-source consent

Consent should be granted independently for each source type.

Examples:

- WhatsApp export
- iMessage export
- calendar data
- email data
- AI chatbot logs
- device metadata

The MVP should default to chat-only consent rather than bundling multiple sources together.

### Required consent disclosures

Before ingestion, the user should understand:

- which source is being ingested
- what categories of signals will be extracted
- whether raw content is stored, transformed, or discarded
- what the agent may use internally for matchmaking
- what another agent may receive in negotiated form
- how the user can revoke access or delete data

### Revocation expectation

The system should be designed so a revoked source can be excluded from future processing without requiring a full redesign of the matching pipeline.

## Trust model

### Private processing boundary

Inside a user's boundary, the system may:

- parse raw consented source data
- extract structured signals
- compute compatibility-relevant internal features
- maintain private representations needed for the user's agent to reason well

### Shareable boundary

Outside that boundary, the system may share only:

- policy-approved summaries
- constrained answers generated during agent negotiation
- strengths, concerns, and recommendation rationale that do not reveal prohibited sensitive inferences

### Product promise

The system should not require another user's agent, or a human operator, to inspect raw message content in order to run matchmaking as designed.

## Data handling classes

### Class A: Safe-to-use compatibility signals

Examples:

- response consistency
- planning horizon
- communication pace
- conflict repair style
- social density
- novelty versus routine tendency

These may be used internally and may be summarized externally when phrased in a policy-safe way.

### Class B: Infer-but-never-surface

These may inform internal ranking or safety logic if product policy explicitly allows them, but they should not be shown directly to users or other agents.

Initial examples:

- self-awareness gap
- attachment volatility risk indicators
- unusually high conflict escalation tendency inferred from conversation behavior
- mismatch between stated preferences and repeated behavior when that gap would be humiliating or overly invasive if surfaced directly

Rule:

- if a trait is useful for internal compatibility reasoning but likely to feel diagnostic, shaming, or unacceptably intimate when exposed, it belongs here by default

### Class C: Never-infer

These should not be inferred for product use, even if technically extractable.

Initial examples:

- mental health diagnoses or disorder claims
- financial precarity or debt stress as a matchmaking variable
- fertility status
- pregnancy status
- family medical history
- highly sensitive protected-class inference that is not strictly user-provided and explicitly needed
- sexual trauma or abuse history

Rule:

- if a trait is highly sensitive, hard to validate, or likely to create legal or ethical risk disproportionate to product value, do not infer it

## Surface policy

### Allowed user-facing outputs

Allowed outputs should stay behavior-framed rather than diagnosis-framed.

Examples:

- prefers consistent communication
- tends to plan ahead
- handles conflict with direct repair
- thrives with lower social overload

### Disallowed user-facing outputs

Disallowed outputs include statements like:

- you are emotionally unavailable
- you have an anxious attachment style
- you are financially unstable
- you seem depressed

The system should describe observable compatibility-relevant behavior, not act like a clinician, background investigator, or moral judge.

## Agent-to-agent disclosure rules

Agents may exchange:

- targeted answers to fit questions
- abstracted behavioral summaries
- compatibility constraints and preferences

Agents may not exchange:

- raw messages
- raw thread excerpts
- hidden sensitive features
- policy-blocked inferred traits

If a response would require revealing blocked information, the agent should either:

- decline to answer directly, or
- answer using a higher-level safe abstraction

## Enforcement checkpoints

Policy should be enforced at all three architecture layers.

### Signal extraction layer

- tag outputs with source provenance
- tag outputs with sensitivity class where relevant
- prevent blocked features from being emitted as ordinary shareable fields

### Compatibility modeling layer

- separate internal feature generation from surfaced outputs
- ensure never-infer categories are excluded from modeling inputs
- ensure infer-but-never-surface categories cannot be emitted without explicit policy review

### Agent negotiation layer

- restrict negotiation prompts to approved summary fields
- prevent prompts from eliciting raw-data disclosure
- log policy denials or redactions for auditability

## Logging and retention expectations

- keep only the minimum retained data required for product behavior and debugging
- avoid logging raw personal content by default
- distinguish operational logs from user-derived signal stores
- make deletion and revocation semantics explicit before broadening data ingestion

## MVP recommendation

For the first real ingestion MVP:

- allow only chat-source consent
- extract only communication and attachment-relevant signals
- keep raw data exposure tightly constrained
- keep sensitive-inference rules conservative

## Open questions

- Which internal features need explicit policy review before they are allowed into ranking?
- How should consent revocation affect already-computed summaries or matches?
- What audit trail is needed to prove that blocked signals were not surfaced?
- Which prompts in agent negotiation need automatic policy linting before use?