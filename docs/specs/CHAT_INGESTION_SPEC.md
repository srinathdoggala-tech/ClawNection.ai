# Clawnection Chat Ingestion Spec

This document turns issue #13 into an implementation-facing ingestion specification.

It defines the MVP scope for importing chat data from WhatsApp and iMessage into the layered Clawnection architecture.

## Purpose

The first real ingestion MVP should focus on chat exports because they are the strongest source of relational behavior and the narrowest viable consent surface.

This spec defines:

- the supported source types
- the canonical normalized message schema
- the ingestion pipeline stages
- parser outputs and failure handling
- the handoff into signal extraction

## MVP scope

### In scope

- user-provided WhatsApp exports
- user-provided iMessage exports
- one-user-at-a-time ingestion
- offline or upload-based parsing of exported data
- normalization into a single internal chat format

### Out of scope

- live inbox sync
- background device monitoring
- calendar, email, location, or AI-chat ingestion in the same first MVP
- broad multi-source fusion during ingestion
- production-scale retention or long-term storage design

## Source assumptions

### WhatsApp

Expected input:

- exported conversation text files
- optional associated media directories, which may be ignored by the first MVP

Useful fields typically available:

- timestamp
- sender display name
- message text
- system-event lines such as joins or encryption notices

### iMessage

Expected input:

- user-exported message data in a supported export format chosen by the team
- the MVP should avoid depending on raw device database access unless the legal and product story is explicit

Useful fields typically needed:

- timestamp
- sender identifier
- conversation identifier
- message body
- attachment presence flag if available

## Canonical ingestion object model

The ingestion layer should normalize all source formats into the same internal structures.

### ChatSource

Represents the uploaded or imported unit.

Required fields:

- sourceType: `whatsapp` or `imessage`
- sourceVersion: parser-visible format version if known
- ownerProfileId: internal user identifier for the importing user
- importedAt: ingestion timestamp
- consentScopeId: reference to the consent grant used for this import

### ConversationRecord

Represents one conversation thread.

Required fields:

- conversationId
- sourceConversationId
- sourceType
- participantLabels
- participantCount
- inferredRelationshipType: one of `unknown`, `close-contact`, `family`, `friend`, `romantic`, `work`, `group`

Notes:

- inferred relationship type should remain provisional and may initially be `unknown`
- conversation identity must be stable enough to support longitudinal extraction later

### MessageRecord

Represents one normalized message event.

Required fields:

- messageId
- conversationId
- sourceType
- sourceTimestamp
- normalizedTimestamp
- senderRole: `owner`, `other`, or `system`
- senderLabel
- contentType: `text`, `media-placeholder`, `call-event`, `system-event`, or `unknown`
- text
- textLength
- hasEmoji
- hasQuestionMark
- hasExclamationMark
- replyToMessageId if available

Optional derived fields during normalization:

- localHourBucket
- dayOfWeek
- isEdited if source supports it
- attachmentCount

## Ingestion pipeline

### Stage 1: Intake

Goals:

- verify source type
- verify file readability
- attach consent scope metadata
- reject unsupported or obviously malformed payloads early

Output:

- accepted import job or validation failure

### Stage 2: Source parsing

Goals:

- parse raw exports into source-specific intermediate records
- preserve line-level provenance for debugging
- isolate parser quirks to source-specific adapters

Output:

- source-specific parsed conversations and messages
- parse warnings and dropped-line counts

### Stage 3: Normalization

Goals:

- map parsed source data into canonical conversation and message records
- convert timestamps into a consistent internal representation
- classify owner versus non-owner messages
- separate system events from user-authored text

Output:

- canonical `ConversationRecord[]`
- canonical `MessageRecord[]`
- normalization warnings

### Stage 4: Quality checks

Goals:

- detect broken timestamps, empty threads, duplicate messages, or missing sender labels
- estimate whether a conversation has enough usable content for signal extraction
- produce coverage metadata for downstream consumers

Output:

- import quality summary
- conversation-level coverage summary
- extraction eligibility flags

### Stage 5: Handoff to signal extraction

Goals:

- deliver a normalized, policy-safe input package to Layer 1 signal extraction
- ensure provenance and coverage metadata survive the handoff

Output:

- signal extraction input bundle

## Source-specific parsing notes

### WhatsApp parser notes

- support line formats with leading date and time stamps
- treat multiline user messages as a continuation of the prior message event
- classify encryption notices, join notices, and other platform lines as `system-event`
- do not fail the entire import because of a small number of malformed lines

### iMessage parser notes

- define one supported export pathway before implementation begins
- keep the parser contract independent from a specific consumer device backup layout where possible
- normalize participant identity and timestamp resolution into the same canonical shape as WhatsApp

## Ownership classification

The ingestion layer must identify which messages belong to the importing user.

Required rule:

- every normalized message should carry a sender role of `owner`, `other`, or `system`

This matters because later signal extraction depends on:

- response latency
- initiation ratio
- mirroring behavior
- conflict pattern attribution

If ownership cannot be determined reliably, the conversation should be flagged as low-confidence for downstream use.

## Quality and failure handling

### Hard failures

Reject the import when:

- the source type is unsupported
- the file cannot be decoded reliably enough to parse
- the user has not granted the needed consent scope

### Soft failures

Allow the import with warnings when:

- some lines are malformed
- some timestamps are missing but most of the thread is valid
- attachment metadata is incomplete
- some participant labels are ambiguous

### Coverage reporting

Each import should report:

- number of conversations imported
- number of messages imported
- number of dropped records
- number of conversations eligible for signal extraction
- parser warnings grouped by type

## Policy requirements during ingestion

- do not emit raw-content fields into agent-shareable outputs
- attach source provenance so downstream layers can audit where a signal came from
- avoid mixing ingestion responsibilities with compatibility scoring
- preserve enough metadata to support deletion and revocation later

## Handoff contract to Layer 1

Signal extraction should receive:

- canonical conversations
- canonical messages
- ingestion coverage summary
- parser and normalization warnings
- consent scope reference

Signal extraction should not need to know:

- the exact original export format syntax
- parser-specific line rules
- UI upload details

## MVP implementation guidance

- start with one golden sample export per source type
- build snapshot fixtures for parser regression testing
- keep source-specific code in separate adapters
- keep the canonical normalized schema stable even if source parsers evolve

## Open questions

- Which exact iMessage export path should be standardized for the MVP?
- Should group chats be included in the first extraction pass or deferred?
- How much message history is needed before a conversation becomes signal-eligible?
- Which normalization fields belong in ingestion versus later enrichment?