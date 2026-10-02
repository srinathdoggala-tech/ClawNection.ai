# Clawnection Compatibility Model

This document turns issue #15 into an implementation-facing compatibility model spec.

It defines how extracted signals should be interpreted into directional fit judgments without collapsing the system into a single opaque score.

## Purpose

The compatibility layer sits between signal extraction and agent negotiation.

Its job is to:

- interpret behavioral signals and user-stated preferences
- compute directional fit rather than only symmetric similarity
- decide where similarity helps, where complementarity helps, and where the answer depends on calibration
- produce private reasoning artifacts and limited shareable summaries for agents

## Core principles

- compatibility is directional
- trait-level reasoning beats one-number matching
- similarity and complementarity must be configured per trait family
- extracted behavior and compatibility judgment must remain separate layers
- sensitive internal features must not automatically become surfaced explanations

## Model position in the stack

Input sources:

- signal extraction outputs
- user preferences and dealbreakers
- product policy constraints

Outputs:

- directional fit profiles
- private compatibility vectors
- explanation ingredients
- shareable negotiation summaries

This layer does not perform the final agent dialogue. It prepares the reasoning artifacts used by the negotiation layer.

## Why directional fit matters

The system should avoid assuming that fit is symmetric.

Examples:

- person A may strongly prefer predictability while person B only weakly cares about it
- person A may tolerate communication mismatch that person B would reject
- person A may need more reassurance than person B is comfortable providing

That means the system should represent:

- `fitAB`: how well person B fits person A
- `fitBA`: how well person A fits person B

An overall match view can exist later, but it should be downstream of directional reasoning rather than a replacement for it.

## Model inputs

### Behavioral inputs

Examples:

- response consistency
- planning horizon
- conflict repair style
- mirroring tendency
- conversation depth
- closeness maintenance patterns
- contact stability

### Stated preference inputs

Examples:

- desired communication style
- age range
- social tempo preferences
- partner criteria
- dealbreakers

### Policy inputs

Examples:

- infer-but-never-surface restrictions
- never-infer exclusions
- approved summary fields for agent sharing

## Trait clusters

The model should group reasoning into explicit trait clusters rather than burying everything in a generic embedding.

### Cluster 1: Communication fit

Examples:

- pace compatibility
- depth compatibility
- mirroring comfort
- directness compatibility
- conflict repair fit

### Cluster 2: Attachment and reliability fit

Examples:

- consistency needs versus consistency supply
- reengagement expectations
- close-tie stability alignment

### Cluster 3: Life-tempo fit

Examples:

- routine versus novelty alignment
- planning horizon fit
- social density compatibility

### Cluster 4: Values-in-behavior fit

Examples:

- who each person keeps showing up for
- how they spend attention and time
- whether priorities seem aligned in lived behavior

### Cluster 5: Ambition-shape fit

Examples:

- status orientation
- mastery orientation
- impact orientation
- security orientation
- freedom orientation

Important rule:

- distinguish level of ambition from shape of ambition

### Cluster 6: Preference and dealbreaker fit

Examples:

- explicit partner criteria satisfaction
- hard exclusions
- soft preference alignment

## Trait handling modes

Each trait or cluster should declare one of three modes.

### Mode A: Similarity-preferred

Use when closeness is usually beneficial.

Examples:

- communication pace
- conflict repair style
- planning horizon

Interpretation:

- smaller distance generally improves fit

### Mode B: Complementarity-capable

Use when moderate difference can be beneficial if the needs still interlock well.

Examples:

- social energy
- novelty versus stability
- expressive intensity in some pairings

Interpretation:

- difference is not automatically bad; evaluate whether the pair still forms a workable dynamic

### Mode C: Calibration-required

Use when the trait cannot be given a default rule without outcome data or product tuning.

Examples:

- humor style
- emotional vocabulary differences
- initiation asymmetry tolerance

Interpretation:

- do not hard-code universal assumptions when the trait is context-sensitive

## Required output objects

The compatibility layer should emit three primary objects:

1. `DirectionalFitProfile`
2. `CompatibilityVector`
3. `NegotiationSummary`

## DirectionalFitProfile

Represents one direction of fit.

Required fields:

- `subjectProfileId`
- `candidateProfileId`
- `clusterScores`
- `dealbreakerStatus`
- `overallDirectionalScore`
- `confidence`
- `explanationIngredients`

### ClusterScore

Required fields:

- `clusterKey`
- `score`
- `mode`: `similarity-preferred`, `complementarity-capable`, or `calibration-required`
- `confidence`
- `supportingSignalKeys`
- `riskFlags`

## CompatibilityVector

Represents the model's private reasoning state.

Required fields:

- `fitAB`
- `fitBA`
- `clusterDeltas`
- `privateOnlyFeatures`
- `policyFlags`

Notes:

- this object is not automatically safe for user or agent display
- it may include private-only features needed for internal ranking or safety logic

## NegotiationSummary

Represents the shareable subset that can be passed into the agent layer.

Required fields:

- `shareableStrengths`
- `shareableConcerns`
- `questionPrompts`
- `blockedTopics`
- `confidence`

Notes:

- the negotiation summary should never expose blocked or private-only features directly
- it should prefer question framing over trait dumping

## Scoring semantics

### Cluster scores

Each cluster should produce a bounded score, such as 0 to 1 or 0 to 100, but the scale should remain secondary to the reasoning contract.

The important thing is that cluster scores are:

- interpretable
- directional
- accompanied by confidence and evidence

### Overall directional score

The overall directional score should be derived from cluster-level reasoning plus preference constraints.

It should not be treated as an unconditional truth statement.

Recommended properties:

- sensitive to hard dealbreakers
- weighted by evidence quality
- decomposable back into cluster drivers

## Dealbreakers and hard constraints

Hard constraints should be evaluated separately from soft preference fit.

Required fields:

- `hardBlock`: boolean
- `blockingReasons`: string array
- `softMismatchNotes`: string array

Rule:

- a strong soft score should not silently override a hard block

## Self-awareness gap

The model may carry a private self-awareness-gap feature when comparing:

- stated self-description
- observed behavior

Allowed use:

- internal ranking and caution flags

Disallowed default use:

- direct user-facing statements
- direct agent-to-agent disclosure

## Confidence model

Confidence should be derived from:

- extraction coverage quality
- number of signal-eligible conversations
- diversity of supporting evidence across threads
- whether the compared trait has clean direct evidence or only weak proxies

Confidence should not be inflated to make the product sound smarter than it is.

## Explanation ingredients

The model should emit explanation ingredients rather than prewritten human-facing judgments.

Each ingredient should include:

- `ingredientKey`
- `clusterKey`
- `direction`
- `sourceSignalKeys`
- `shareability`

Example ingredient types:

- strong alignment in communication rhythm
- mismatch in planning horizon needs
- consistent repair-style compatibility
- possible asymmetry in reassurance expectations

## Risk flags

Risk flags should warn the agent layer about likely friction without turning into clinical labels.

Examples:

- `communication_asymmetry_risk`
- `planning_mismatch_risk`
- `consistency_expectation_gap`
- `conflict_repair_gap`

Risk flags should be:

- behavior-framed
- policy-checked
- tied to supporting evidence

## Example model fragment

```json
{
  "fitAB": {
    "subjectProfileId": "user_a",
    "candidateProfileId": "user_b",
    "clusterScores": [
      {
        "clusterKey": "communication_fit",
        "score": 82,
        "mode": "similarity-preferred",
        "confidence": "high",
        "supportingSignalKeys": [
          "responseLatencyProfile",
          "mirroringProfile",
          "conflictStyleProfile"
        ],
        "riskFlags": []
      },
      {
        "clusterKey": "life_tempo_fit",
        "score": 58,
        "mode": "complementarity-capable",
        "confidence": "medium",
        "supportingSignalKeys": [
          "planningHorizon",
          "socialDensity"
        ],
        "riskFlags": ["planning_mismatch_risk"]
      }
    ],
    "dealbreakerStatus": {
      "hardBlock": false,
      "blockingReasons": [],
      "softMismatchNotes": ["prefers_more_advance_planning"]
    },
    "overallDirectionalScore": 74,
    "confidence": "medium"
  }
}
```

## Non-goals

- no single universal similarity score as the only output
- no raw-message reasoning in this layer
- no diagnosis-style labels
- no agent dialogue generation in this layer

## Open questions

- Which clusters should be weighted most heavily before outcome data exists?
- Which traits belong in similarity-preferred versus complementarity-capable by default?
- How should uncertainty propagate from extraction confidence into directional scores?
- Which explanation ingredients should be auto-eligible for negotiation summaries versus held private by default?