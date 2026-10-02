import { ParsedMessage } from "@/lib/types/behavioral";

export type ParseResult = {
  messages: ParsedMessage[];
  detectedFormat: "ios" | "android" | "unknown";
  parseErrors: number;
};

// iOS: [15/01/2024, 09:32:01] Name: body
// iOS with AM/PM: [1/15/24, 9:32:01 AM] Name: body
const IOS_LINE_RE =
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s*([^:]+?):\s*([\s\S]*)$/i;

// Android: 15/01/2024, 09:32 - Name: body
// Android US: 1/15/24, 9:32 AM - Name: body
const ANDROID_LINE_RE =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*-\s*([^:]+?):\s*([\s\S]*)$/i;

const SYSTEM_BODY_FRAGMENTS = [
  "messages and calls are end-to-end encrypted",
  "you deleted this message",
  "this message was deleted",
  "missed voice call",
  "missed video call",
  "changed the subject",
  "changed this group",
  "added you",
  " left",
  "created group",
  "changed their phone number",
  "security code changed",
  "tap to learn more",
];

function isSystemMessage(sender: string, body: string): boolean {
  const lowerBody = body.toLowerCase();
  if (SYSTEM_BODY_FRAGMENTS.some((frag) => lowerBody.includes(frag))) return true;
  // Senders with no alphabetical chars are system lines (e.g. phone numbers only)
  if (!/[a-zA-Z]/.test(sender)) return true;
  return false;
}

function parseDateTime(datePart: string, timePart: string): Date | null {
  try {
    // Normalize: remove extra spaces, unify separators
    const d = datePart.trim();
    const t = timePart.trim();
    const combined = `${d} ${t}`;
    const parsed = new Date(combined);
    if (!isNaN(parsed.getTime())) return parsed;

    // Fallback: try rearranging dd/mm/yyyy → mm/dd/yyyy
    const parts = d.split("/");
    if (parts.length === 3) {
      const [a, b, c] = parts;
      const alt = new Date(`${b}/${a}/${c} ${t}`);
      if (!isNaN(alt.getTime())) return alt;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseWhatsAppExport(rawText: string): ParseResult {
  // Strip BOM and normalize line endings
  const text = rawText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");

  const messages: ParsedMessage[] = [];
  let detectedFormat: ParseResult["detectedFormat"] = "unknown";
  let parseErrors = 0;

  // Pending message being assembled (handles multi-line bodies)
  let pending: {
    datePart: string;
    timePart: string;
    sender: string;
    bodyLines: string[];
  } | null = null;

  function flushPending() {
    if (!pending) return;
    const { datePart, timePart, sender, bodyLines } = pending;
    const timestamp = parseDateTime(datePart, timePart);
    if (!timestamp) {
      parseErrors++;
      pending = null;
      return;
    }
    const body = bodyLines.join("\n");
    messages.push({
      timestamp,
      sender: sender.trim(),
      body,
      isSystem: isSystemMessage(sender.trim(), body),
    });
    pending = null;
  }

  for (const line of lines) {
    if (!line.trim()) continue;

    const iosMatch = IOS_LINE_RE.exec(line);
    const androidMatch = !iosMatch ? ANDROID_LINE_RE.exec(line) : null;
    const match = iosMatch ?? androidMatch;

    if (match) {
      flushPending();

      if (detectedFormat === "unknown") {
        detectedFormat = iosMatch ? "ios" : "android";
      }

      const [, datePart, timePart, sender, firstBodyLine] = match;
      pending = { datePart, timePart, sender, bodyLines: [firstBodyLine] };
    } else if (pending) {
      // Continuation of previous message body
      pending.bodyLines.push(line);
    }
    // Lines before the first message (e.g. encryption notice at top) are silently dropped
  }

  flushPending();

  return { messages, detectedFormat, parseErrors };
}
