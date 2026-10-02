/**
 * lib/whatsapp/normalize.test.ts
 *
 * Jest / Vitest-compatible unit tests for the WhatsApp normalization layer.
 * Run with:  npx jest lib/whatsapp/normalize.test.ts
 */

/// <reference types="@types/jest" />


import { normalizeWhatsAppExport, type ParsedMessage } from "./normalize";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function msg(
  sender: string,
  message: string,
  timestamp = new Date("2024-03-15T10:00:00Z"),
  isSystem = false
): ParsedMessage {
  return { sender, message, timestamp, isSystem };
}

const BASIC_MESSAGES: ParsedMessage[] = [
  msg("Maya", "Hey! How's it going?", new Date("2024-01-01T09:00:00Z")),
  msg("Alex", "Pretty good! You?", new Date("2024-01-01T09:01:00Z")),
  msg("Maya", "Great thanks 😊", new Date("2024-01-01T09:02:00Z")),
  msg("Alex", "https://example.com", new Date("2024-01-01T09:03:00Z")),
  msg("Maya", "<Media omitted>", new Date("2024-01-01T09:04:00Z")),
  msg("", "Messages and calls are end-to-end encrypted.", new Date("2024-01-01T08:59:00Z"), true),
];

// ---------------------------------------------------------------------------
// Source metadata
// ---------------------------------------------------------------------------

describe("ChatSource", () => {
  it("populates all required source fields", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, {
      fileNames: ["chat.txt"],
      consentScope: "self_only",
    });

    expect(result.source.fileNames).toEqual(["chat.txt"]);
    expect(result.source.consentScope).toBe("self_only");
    expect(result.source.sourceType).toBe("whatsapp_export_txt");
    expect(result.source.importId).toBeTruthy();
    expect(result.source.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("defaults consentScope to unspecified when omitted", () => {
    const result = normalizeWhatsAppExport([], { fileNames: ["chat.txt"] });
    expect(result.source.consentScope).toBe("unspecified");
  });

  it("generates unique importIds across calls", () => {
    const a = normalizeWhatsAppExport([], { fileNames: ["a.txt"] });
    const b = normalizeWhatsAppExport([], { fileNames: ["b.txt"] });
    expect(a.source.importId).not.toBe(b.source.importId);
  });
});

// ---------------------------------------------------------------------------
// ConversationRecord
// ---------------------------------------------------------------------------

describe("ConversationRecord", () => {
  it("produces exactly one conversation per export", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, { fileNames: ["chat.txt"] });
    expect(result.conversations).toHaveLength(1);
  });

  it("collects unique non-system participants", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, { fileNames: ["chat.txt"] });
    const { participants } = result.conversations[0];
    expect(participants).toContain("Maya");
    expect(participants).toContain("Alex");
    expect(participants).not.toContain(""); // system sender excluded
  });

  it("resolves selfParticipant from selfHint (exact match)", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, {
      fileNames: ["chat.txt"],
      selfHint: "Maya",
    });
    expect(result.conversations[0].selfParticipant).toBe("Maya");
  });

  it("resolves selfParticipant from selfHint (case-insensitive substring)", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, {
      fileNames: ["chat.txt"],
      selfHint: "may",
    });
    expect(result.conversations[0].selfParticipant).toBe("Maya");
  });

  it("leaves selfParticipant undefined when hint matches nothing", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, {
      fileNames: ["chat.txt"],
      selfHint: "Zara",
    });
    expect(result.conversations[0].selfParticipant).toBeUndefined();
  });

  it("records correct startsAtMs and endsAtMs", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, { fileNames: ["chat.txt"] });
    const conv = result.conversations[0];
    // earliest message is the system notice at 08:59
    expect(conv.startsAtMs).toBe(new Date("2024-01-01T08:59:00Z").getTime());
    expect(conv.endsAtMs).toBe(new Date("2024-01-01T09:04:00Z").getTime());
  });
});

// ---------------------------------------------------------------------------
// MessageRecord — senderRole
// ---------------------------------------------------------------------------

describe("MessageRecord senderRole", () => {
  it("tags system messages as 'system'", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, {
      fileNames: ["chat.txt"],
      selfHint: "Maya",
    });
    const systemMsg = result.conversations[0].messages.find(
      (m) => m.senderName === ""
    );
    expect(systemMsg?.senderRole).toBe("system");
  });

  it("tags self messages correctly", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, {
      fileNames: ["chat.txt"],
      selfHint: "Maya",
    });
    const selfMessages = result.conversations[0].messages.filter(
      (m) => m.senderName === "Maya"
    );
    expect(selfMessages.every((m) => m.senderRole === "self")).toBe(true);
  });

  it("tags other participant messages correctly", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, {
      fileNames: ["chat.txt"],
      selfHint: "Maya",
    });
    const otherMessages = result.conversations[0].messages.filter(
      (m) => m.senderName === "Alex"
    );
    expect(otherMessages.every((m) => m.senderRole === "other")).toBe(true);
  });

  it("falls back to 'other' when no selfHint provided", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, { fileNames: ["chat.txt"] });
    const nonSystem = result.conversations[0].messages.filter(
      (m) => m.senderRole !== "system"
    );
    expect(nonSystem.every((m) => m.senderRole === "other")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MessageRecord — contentType
// ---------------------------------------------------------------------------

describe("MessageRecord contentType", () => {
  it("classifies plain text as 'text'", () => {
    const result = normalizeWhatsAppExport(
      [msg("Maya", "Hello world")],
      { fileNames: ["chat.txt"] }
    );
    expect(result.conversations[0].messages[0].contentType).toBe("text");
  });

  it("classifies '<Media omitted>' as 'media_omitted'", () => {
    const result = normalizeWhatsAppExport(
      [msg("Maya", "<Media omitted>")],
      { fileNames: ["chat.txt"] }
    );
    expect(result.conversations[0].messages[0].contentType).toBe("media_omitted");
  });

  it("classifies bare URLs as 'link'", () => {
    const result = normalizeWhatsAppExport(
      [msg("Alex", "https://example.com/path?q=1")],
      { fileNames: ["chat.txt"] }
    );
    expect(result.conversations[0].messages[0].contentType).toBe("link");
  });

  it("classifies emoji-only messages as 'emoji_only'", () => {
    const result = normalizeWhatsAppExport(
      [msg("Maya", "😊❤️🎉")],
      { fileNames: ["chat.txt"] }
    );
    expect(result.conversations[0].messages[0].contentType).toBe("emoji_only");
  });

  it("classifies system notices as 'system_notice'", () => {
    const result = normalizeWhatsAppExport(
      [msg("", "Messages and calls are end-to-end encrypted.", new Date(), true)],
      { fileNames: ["chat.txt"] }
    );
    expect(result.conversations[0].messages[0].contentType).toBe("system_notice");
  });
});

// ---------------------------------------------------------------------------
// MessageRecord — isDeleted + body sanitization
// ---------------------------------------------------------------------------

describe("MessageRecord deletion handling", () => {
  it("marks deleted messages with isDeleted=true and empty body", () => {
    const result = normalizeWhatsAppExport(
      [msg("Maya", "This message was deleted")],
      { fileNames: ["chat.txt"] }
    );
    const m = result.conversations[0].messages[0];
    expect(m.isDeleted).toBe(true);
    expect(m.body).toBe("");
  });

  it("handles 'You deleted this message' variant", () => {
    const result = normalizeWhatsAppExport(
      [msg("Maya", "You deleted this message")],
      { fileNames: ["chat.txt"] }
    );
    expect(result.conversations[0].messages[0].isDeleted).toBe(true);
  });

  it("does not mark normal messages as deleted", () => {
    const result = normalizeWhatsAppExport(
      [msg("Maya", "I deleted my plans for tonight 😅")],
      { fileNames: ["chat.txt"] }
    );
    expect(result.conversations[0].messages[0].isDeleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Import quality metadata
// ---------------------------------------------------------------------------

describe("ImportQuality", () => {
  it("reports selfResolved=true when hint was matched", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, {
      fileNames: ["chat.txt"],
      selfHint: "Maya",
    });
    expect(result.quality.selfResolved).toBe(true);
  });

  it("reports selfResolved=false when no hint given", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, { fileNames: ["chat.txt"] });
    expect(result.quality.selfResolved).toBe(false);
  });

  it("produces coverageQuality=good for 30+ day span", () => {
    const long: ParsedMessage[] = [
      msg("Maya", "start", new Date("2024-01-01T00:00:00Z")),
      msg("Alex", "end", new Date("2024-02-15T00:00:00Z")),
    ];
    const result = normalizeWhatsAppExport(long, { fileNames: ["chat.txt"] });
    expect(result.quality.coverageQuality).toBe("good");
  });

  it("produces coverageQuality=partial for 7–29 day span", () => {
    const medium: ParsedMessage[] = [
      msg("Maya", "start", new Date("2024-01-01T00:00:00Z")),
      msg("Alex", "end", new Date("2024-01-10T00:00:00Z")),
    ];
    const result = normalizeWhatsAppExport(medium, { fileNames: ["chat.txt"] });
    expect(result.quality.coverageQuality).toBe("partial");
  });

  it("produces coverageQuality=sparse for <7 day span", () => {
    const short: ParsedMessage[] = [
      msg("Maya", "start", new Date("2024-01-01T00:00:00Z")),
      msg("Alex", "end", new Date("2024-01-03T00:00:00Z")),
    ];
    const result = normalizeWhatsAppExport(short, { fileNames: ["chat.txt"] });
    expect(result.quality.coverageQuality).toBe("sparse");
  });

  it("adds a note when coverage is sparse", () => {
    const short: ParsedMessage[] = [
      msg("Maya", "hi", new Date("2024-01-01T00:00:00Z")),
      msg("Alex", "hey", new Date("2024-01-02T00:00:00Z")),
    ];
    const result = normalizeWhatsAppExport(short, { fileNames: ["chat.txt"] });
    expect(result.quality.notes.some((n) => n.includes("day(s)"))).toBe(true);
  });

  it("adds a note when selfHint could not be resolved", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, { fileNames: ["chat.txt"] });
    expect(result.quality.notes.some((n) => n.includes("selfHint"))).toBe(true);
  });

  it("reports parsedMessageCount correctly", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, { fileNames: ["chat.txt"] });
    expect(result.quality.parsedMessageCount).toBe(BASIC_MESSAGES.length);
  });
});

// ---------------------------------------------------------------------------
// Message IDs are stable and unique within an import
// ---------------------------------------------------------------------------

describe("MessageRecord IDs", () => {
  it("produces unique IDs for every message", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, { fileNames: ["chat.txt"] });
    const ids = result.conversations[0].messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("IDs contain the importId as a prefix", () => {
    const result = normalizeWhatsAppExport(BASIC_MESSAGES, { fileNames: ["chat.txt"] });
    const { importId } = result.source;
    const allPrefixed = result.conversations[0].messages.every((m) =>
      m.id.startsWith(importId)
    );
    expect(allPrefixed).toBe(true);
  });
});