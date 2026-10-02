# Clawnection Signal Schema

This document turns issue #14 into an implementation-facing schema for chat-derived signals.

It defines the structured outputs that Layer 1 signal extraction should produce after chat ingestion has normalized WhatsApp or iMessage exports.

## Purpose

The extraction layer should convert raw conversations into observable behavioral signals without collapsing directly into compatibility judgments.

This schema exists to answer four questions:

1. what signal families should be extracted first
2. what shape those outputs should take
3. what confidence and provenance metadata must travel with them
4. which signals are private-only versus safe for downstream summarization

## Scope

### In scope for the first pass

- communication style signals
- attachment and relational-pattern signals
- conversation coverage and confidence metadata
- source provenance metadata

### Out of scope for the first pass

- final compatibility scoring
- recommendation generation
- long-term identity or diagnosis claims
- multi-source fused traits from calendar, email, or location data

## Extraction design rules

- every signal must be grounded in observable conversation behavior
- every signal should include enough metadata to explain its confidence
- extraction should prefer distributions and tendencies over absolute labels
- sensitive signals should be tagged for downstream policy handling
- the schema should separate private internal signals from shareable summaries

## Top-level output objects

Signal extraction should emit three kinds of objects:

1. `SignalBundle`
2. `ConversationSignalProfile`
3. `GlobalSignalProfile`

## SignalBundle

Represents the full extraction output for one imported user's chat dataset.

Required fields:

- `ownerProfileId`
- `sourceTypes`: array of contributing source types
- `generatedAt`
- `coverageSummary`
- `conversationProfiles`: `ConversationSignalProfile[]`
- `globalProfile`: `GlobalSignalProfile`
- `policyFlags`

## CoverageSummary

Summarizes whether the extracted outputs are based on enough data to trust.

Required fields:

- `conversationCount`
- `eligibleConversationCount`
- `messageCount`
- `ownerMessageCount`
- `otherMessageCount`
- `dateRangeStart`
- `dateRangeEnd`
- `coverageQuality`: one of `low`, `medium`, `high`
- `warnings`: string array

## ConversationSignalProfile

Represents extracted signals for one conversation thread.

Required fields:

- `conversationId`
- `participantCount`
- `inferredRelationshipType`
- `coverage`
- `communicationStyle`
- `attachmentPattern`
- `policyTags`

### Conversation coverage

Required fields:

- `messageCount`
- `ownerMessageCount`
- `otherMessageCount`
- `activeDays`
- `isSignalEligible`
- `confidence`: one of `low`, `medium`, `high`

## GlobalSignalProfile

Represents aggregated tendencies across the user's usable conversations.

Required fields:

- `communicationStyle`
- `attachmentPattern`
- `stabilityMetrics`
- `coverage`
- `privateOnlySignals`
- `shareableSummaryCandidates`

## CommunicationStyleProfile

These signals describe how a person communicates, not whether they are compatible with someone else.

Required fields:

- `responseLatencyProfile`
- `initiationProfile`
- `messageDepthProfile`
- `mirroringProfile`
- `conflictStyleProfile`
- `expressivenessProfile`

### ResponseLatencyProfile

Required fields:

- `medianMinutesToReply`
- `p90MinutesToReply`
- `weekdayVsWeekendShift`
- `dayVsNightShift`
- `consistency`: one of `low`, `medium`, `high`
- `confidence`

Interpretation note:

- this is a behavioral timing signal, not a character judgment

### InitiationProfile

Required fields:

- `ownerInitiationRatio`
- `conversationRestartRatio`
- `followThroughRatio`
- `confidence`

Interpretation note:

- measures tendency to start and sustain conversation, not interest in any one person by itself

### MessageDepthProfile

Required fields:

- `averageOwnerMessageLength`
- `averageOtherMessageLength`
- `longMessageRatio`
- `questionAskingRatio`
- `threadDepthIndex`
- `confidence`

### MirroringProfile

Required fields:

- `tempoMirroring`
- `lengthMirroring`
- `emojiMirroring`
- `punctuationMirroring`
- `confidence`

Interpretation note:

- mirroring should be represented as a tendency, not a binary label

### ConflictStyleProfile

Required fields:

- `repairAfterTensionIndex`
- `escalationTendency`
- `avoidanceTendency`
- `directnessAfterConflict`
- `confidence`
- `sensitivityClass`

Policy note:

- conflict style may be useful for matching but should still be treated carefully in user-facing summaries

### ExpressivenessProfile

Required fields:

- `emojiDensity`
- `punctuationIntensity`
- `emotionalVocabularyRange`
- `humorSignalStrength`
- `confidence`

## AttachmentPatternProfile

These signals should remain behavior-framed and should avoid diagnosis-style language.

Required fields:

- `consistencyProfile`
- `relationshipStabilityProfile`
- `reengagementProfile`
- `closenessMaintenanceProfile`

### ConsistencyProfile

Required fields:

- `replyRegularity`
- `dropoffFrequency`
- `recoveryAfterSilence`
- `confidence`

### RelationshipStabilityProfile

Required fields:

- `stableCloseTieRatio`
- `highVolumeThreadLongevity`
- `contactChurnIndex`
- `confidence`

### ReengagementProfile

Required fields:

- `reachesBackOutAfterDistance`
- `waitsForOthersToReinitiate`
- `confidence`
- `sensitivityClass`

### ClosenessMaintenanceProfile

Required fields:

- `sustainedCloseContactDensity`
- `familyContactConsistency`
- `friendContactConsistency`
- `confidence`

## StabilityMetrics

These are dataset-level metrics used to qualify downstream interpretation.

Required fields:

- `topContactConcentration`
- `longitudinalCoverageMonths`
- `usableConversationSpread`
- `outlierConversationWeight`

## Private-only signals

Some extracted signals may be useful internally but should not be emitted as shareable summaries.

The schema should support a private-only list with entries like:

- `signalKey`
- `value`
- `reason`
- `sensitivityClass`

Examples:

- attachment volatility risk indicators
- self-awareness-gap ingredients
- conflict-escalation flags that would feel diagnostic if surfaced literally

## ShareableSummaryCandidate

Represents behavior-framed summaries that downstream layers may choose to use.

Required fields:

- `summaryKey`
- `summaryText`
- `sourceSignalKeys`
- `confidence`
- `approvedForAgentSharing`

Examples:

- `prefers_consistent_communication`
- `tends_to_plan_ahead`
- `repairs_conflict_directly`
- `does_best_with_lower_social_overload`

## Provenance requirements

Every signal family should carry:

- `sourceTypes`
- `conversationIds`
- `coverageWindow`
- `confidence`
- `sensitivityClass` where applicable

This allows downstream layers to:

- audit where a signal came from
- avoid over-trusting thin data
- enforce disclosure rules consistently

## Sensitivity classes

Recommended values:

- `standard`
- `careful`
- `private-only`
- `blocked`

Usage guidance:

- `standard`: ordinary behavioral signal safe for model use and controlled summarization
- `careful`: usable internally but should be reviewed before surfacing directly
- `private-only`: internal feature only
- `blocked`: should not be emitted from extraction for product use

## Confidence guidance

Confidence should reflect evidence quality, not model certainty theater.

Inputs to confidence can include:

- number of usable messages
- number of active days represented
- number of eligible conversations
- presence of clean ownership classification
- amount of missing or malformed data

## Example extraction output fragment

```json
{
  "ownerProfileId": "user_123",
  "globalProfile": {
    "communicationStyle": {
      "responseLatencyProfile": {
        "medianMinutesToReply": 34,
        "p90MinutesToReply": 410,
        "weekdayVsWeekendShift": "slower_on_weekdays",
        "dayVsNightShift": "faster_during_evening",
        "consistency": "medium",
        "confidence": "high"
      }
    },
    "shareableSummaryCandidates": [
      {
        "summaryKey": "prefers_consistent_communication",
        "summaryText": "Usually responds with a steady rhythm and values ongoing conversational continuity.",
        "sourceSignalKeys": ["responseLatencyProfile", "consistencyProfile"],
        "confidence": "medium",
        "approvedForAgentSharing": true
      }
    ]
  }
}
```

## Non-goals

- no final compatibility verdicts in this layer
- no one-number match score
- no diagnosis-style labels such as anxious, avoidant, depressed, or unstable
- no raw message excerpts in downstream shareable summaries

## Open questions

- Which conversation-level signals should roll up into the global profile by weighted average versus explicit heuristics?
- How should group chats be weighted relative to one-to-one conversations?
- Which signals deserve `careful` versus `private-only` by default?
- Which summary candidates should be generated automatically versus authored later by the agent layer?