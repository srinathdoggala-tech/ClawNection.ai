/**
 * Canonical ingestion types for chat normalization.
 *
 * These types form the stable contract between source-specific parsers
 * (WhatsApp, iMessage, etc.) and downstream signal extraction. Adding a
 * new source only requires implementing `ChatSource` + the normalizer;
 * the signal layer stays untouched.
 */

// ---------------------------------------------------------------------------
// Source metadata
// ---------------------------------------------------------------------------

export type ChatSourceType = "whatsapp_export_txt" | "whatsapp_export_zip";

/** Consent scope declared by the user at upload time. */
export type ConsentScope =
  | "self_only"       // user exported their own chat history
  | "mutual_consent"  // both parties agreed to share for matching
  | "unspecified";

export interface ChatSource {
  /** Unique ID for this import event (crypto.randomUUID at ingestion time). */
  importId: string;
  sourceType: ChatSourceType;
  /** Original filename(s) supplied by the user. */
  fileNames: string[];
  /** ISO-8601 timestamp of when the import was processed. */
  importedAt: string;
  consentScope: ConsentScope;
  /** Clawnection user ID who performed the upload (undefined in local-only mode). */
  ownerId?: string;
}

// ---------------------------------------------------------------------------
// Canonical conversation + message records
// ---------------------------------------------------------------------------

export type SenderRole =
  | "self"        // the profile owner (detected from the local participant heuristic)
  | "other"       // counterpart(s)
  | "system";     // WhatsApp system messages ("Messages and calls are end-to-end encrypted")

export type MessageContentType =
  | "text"
  | "media_omitted"   // "<Media omitted>" placeholder
  | "link"
  | "emoji_only"      // message body is exclusively emoji characters
  | "system_notice"   // WhatsApp-generated notice
  | "unknown";

export interface MessageRecord {
  /** Stable ID within this import: `${importId}:${sequenceIndex}` */
  id: string;
  conversationId: string;
  /** Unix epoch ms derived from the parsed timestamp. */
  timestampMs: number;
  /** Raw sender display name from the export. */
  senderName: string;
  senderRole: SenderRole;
  contentType: MessageContentType;
  /** Cleaned text body; empty string for media_omitted. */
  body: string;
  /** True if WhatsApp marked this as a deleted message. */
  isDeleted: boolean;
}

export interface ConversationRecord {
  /** Derived from importId + participant fingerprint. */
  id: string;
  importId: string;
  /** Display names of all detected participants. */
  participants: string[];
  /** The participant resolved to "self" (may be undefined if indeterminate). */
  selfParticipant?: string;
  /** Unix epoch ms of the earliest message. */
  startsAtMs: number;
  /** Unix epoch ms of the latest message. */
  endsAtMs: number;
  messages: MessageRecord[];
}

// ---------------------------------------------------------------------------
// Import quality metadata
// ---------------------------------------------------------------------------

export type CoverageQuality = "good" | "partial" | "sparse";

export interface ImportQuality {
  totalRawLines: number;
  parsedMessageCount: number;
  /** Lines that matched no known pattern and were silently dropped. */
  droppedCount: number;
  /** Ratio of dropped to total raw lines (0–1). */
  dropRate: number;
  /** Whether the export covers at least 30 days of messages. */
  coverageQuality: CoverageQuality;
  /** True if the "self" participant could be confidently resolved. */
  selfResolved: boolean;
  /** Human-readable notes about edge cases encountered. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Top-level ingestion result
// ---------------------------------------------------------------------------

export interface ChatIngestionResult {
  source: ChatSource;
  conversations: ConversationRecord[];
  quality: ImportQuality;
}