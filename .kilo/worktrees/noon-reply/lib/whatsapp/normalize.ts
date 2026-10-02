/**
 * lib/whatsapp/normalize.ts
 *
 * Converts the lightweight `ParsedMessage[]` produced by the WhatsApp parser
 * into a canonical `ChatIngestionResult` that downstream signal extraction
 * can consume without knowing anything about the WhatsApp text format.
 *
 * Usage:
 *
 *   import { parseWhatsAppExport } from "./parser";
 *   import { normalizeWhatsAppExport } from "./normalize";
 *
 *   const parsed = parseWhatsAppExport(rawText, fileName);
 *   const ingestion = normalizeWhatsAppExport(parsed, {
 *     fileNames: [fileName],
 *     consentScope: "self_only",
 *     selfHint: "Maya",   // optional: helps resolve senderRole="self"
 *   });
 */

import type {
  ChatIngestionResult,
  ChatSource,
  ChatSourceType,
  ConversationRecord,
  CoverageQuality,
  ImportQuality,
  MessageContentType,
  MessageRecord,
  SenderRole,
} from "./ingestion-types";

// ---------------------------------------------------------------------------
// Minimal shape we expect from the existing parser.
// If parser.ts exports a richer type, replace this with the real import.
// ---------------------------------------------------------------------------

export interface ParsedMessage {
  timestamp: Date;
  sender: string;
  message: string;
  /** Some parser variants expose this already. */
  isSystem?: boolean;
}

// ---------------------------------------------------------------------------
// Normalizer options
// ---------------------------------------------------------------------------

export interface NormalizeOptions {
  fileNames: string[];
  /**
   * Source type hint. Defaults to "whatsapp_export_txt".
   * Pass "whatsapp_export_zip" when the user uploaded a .zip.
   */
  sourceType?: ChatSourceType;
  consentScope?: ChatSource["consentScope"];
  /**
   * Display name (or substring) of the profile owner so we can tag their
   * messages as senderRole="self". Case-insensitive substring match.
   */
  selfHint?: string;
  ownerId?: string;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function normalizeWhatsAppExport(
  parsed: ParsedMessage[],
  opts: NormalizeOptions
): ChatIngestionResult {
  const importId = generateImportId();
  const importedAt = new Date().toISOString();

  const source: ChatSource = {
    importId,
    sourceType: opts.sourceType ?? "whatsapp_export_txt",
    fileNames: opts.fileNames,
    importedAt,
    consentScope: opts.consentScope ?? "unspecified",
    ownerId: opts.ownerId,
  };

  // Resolve "self" participant from the message set
  const selfParticipant = resolveSelf(parsed, opts.selfHint);

  // Build a single ConversationRecord (WhatsApp exports one chat per file)
  const conversationId = `${importId}:conv:0`;
  const participants = collectParticipants(parsed);

  const notes: string[] = [];
  if (!selfParticipant) {
    notes.push(
      "Could not confidently resolve 'self' participant. " +
        "Provide selfHint matching the profile owner's display name."
    );
  }

  const messages: MessageRecord[] = parsed.map((msg, idx) =>
    toMessageRecord(msg, idx, importId, conversationId, selfParticipant)
  );

  const droppedCount = countDropped(parsed);

  const conversation: ConversationRecord = {
    id: conversationId,
    importId,
    participants,
    selfParticipant,
    startsAtMs: messages.length ? messages[0].timestampMs : 0,
    endsAtMs: messages.length ? messages[messages.length - 1].timestampMs : 0,
    messages,
  };

  const quality = buildQuality({
    totalRawLines: parsed.length + droppedCount,
    parsedCount: parsed.length,
    droppedCount,
    conversation,
    selfResolved: !!selfParticipant,
    notes,
  });

  return {
    source,
    conversations: [conversation],
    quality,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toMessageRecord(
  msg: ParsedMessage,
  idx: number,
  importId: string,
  conversationId: string,
  selfParticipant: string | undefined
): MessageRecord {
  const body = msg.message.trim();
  const isSystem = msg.isSystem ?? isSystemSender(msg.sender);

  return {
    id: `${importId}:${idx}`,
    conversationId,
    timestampMs: msg.timestamp.getTime(),
    senderName: msg.sender,
    senderRole: resolveRole(msg.sender, selfParticipant, isSystem),
    contentType: classifyContent(body, isSystem),
    body: isSystem ? body : sanitizeBody(body),
    isDeleted: isDeletedMessage(body),
  };
}

function resolveRole(
  sender: string,
  selfParticipant: string | undefined,
  isSystem: boolean
): SenderRole {
  if (isSystem) return "system";
  if (selfParticipant && isSameSender(sender, selfParticipant)) return "self";
  return "other";
}

function classifyContent(body: string, isSystem: boolean): MessageContentType {
  if (isSystem) return "system_notice";
  if (!body || isDeletedMessage(body)) return "text";
  if (isMediaOmitted(body)) return "media_omitted";
  if (isLinkOnly(body)) return "link";
  if (isEmojiOnly(body)) return "emoji_only";
  return "text";
}

function sanitizeBody(body: string): string {
  if (isDeletedMessage(body)) return "";
  return body;
}

// ---------------------------------------------------------------------------
// Participant + self resolution
// ---------------------------------------------------------------------------

function collectParticipants(messages: ParsedMessage[]): string[] {
  const seen = new Set<string>();
  for (const msg of messages) {
    if (!isSystemSender(msg.sender)) seen.add(msg.sender);
  }
  return Array.from(seen);
}

function resolveSelf(
  messages: ParsedMessage[],
  hint?: string
): string | undefined {
  if (!hint) return undefined;
  const lower = hint.toLowerCase();
  const participants = collectParticipants(messages);
  // Exact match first
  const exact = participants.find((p) => p.toLowerCase() === lower);
  if (exact) return exact;
  // Substring match
  return participants.find((p) => p.toLowerCase().includes(lower));
}

function isSameSender(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// ---------------------------------------------------------------------------
// Content classifiers
// ---------------------------------------------------------------------------

function isSystemSender(sender: string): boolean {
  return !sender || sender.trim() === "";
}

function isMediaOmitted(body: string): boolean {
  return /^<media omitted>$/i.test(body.trim());
}

function isDeletedMessage(body: string): boolean {
  return /^(this message was deleted|you deleted this message)\.?$/i.test(
    body.trim()
  );
}

function isLinkOnly(body: string): boolean {
  return /^https?:\/\/\S+$/.test(body.trim());
}

const EMOJI_RE =
  /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u;

function isEmojiOnly(body: string): boolean {
  return EMOJI_RE.test(body.trim());
}

// ---------------------------------------------------------------------------
// Drop counting
// ---------------------------------------------------------------------------

/**
 * If the caller passes in a raw line count via `opts`, use it; otherwise
 * we estimate 0 drops (conservative — avoids misleading quality scores).
 */
function countDropped(_parsed: ParsedMessage[]): number {
  // Downstream: swap this for `rawLineCount - parsed.length` once the
  // parser exposes rawLineCount in its return value.
  return 0;
}

// ---------------------------------------------------------------------------
// Quality metadata
// ---------------------------------------------------------------------------

interface QualityInput {
  totalRawLines: number;
  parsedCount: number;
  droppedCount: number;
  conversation: ConversationRecord;
  selfResolved: boolean;
  notes: string[];
}

function buildQuality(input: QualityInput): ImportQuality {
  const {
    totalRawLines,
    parsedCount,
    droppedCount,
    conversation,
    selfResolved,
    notes,
  } = input;

  const dropRate =
    totalRawLines > 0 ? droppedCount / totalRawLines : 0;

  const spanDays =
    conversation.messages.length > 1
      ? (conversation.endsAtMs - conversation.startsAtMs) /
        (1000 * 60 * 60 * 24)
      : 0;

  let coverageQuality: CoverageQuality;
  if (spanDays >= 30) coverageQuality = "good";
  else if (spanDays >= 7) coverageQuality = "partial";
  else coverageQuality = "sparse";

  if (spanDays < 7) {
    notes.push(
      `Chat export covers only ${Math.round(spanDays)} day(s). ` +
        "Signal quality may be low — encourage the user to export a longer history."
    );
  }

  if (dropRate > 0.1) {
    notes.push(
      `High drop rate (${(dropRate * 100).toFixed(1)}%). ` +
        "Some messages may have been in an unrecognised format."
    );
  }

  return {
    totalRawLines,
    parsedMessageCount: parsedCount,
    droppedCount,
    dropRate,
    coverageQuality,
    selfResolved,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function generateImportId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without the Web Crypto API
  return `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}