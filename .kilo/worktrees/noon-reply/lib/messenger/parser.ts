import { ParsedMessage } from "@/lib/types/behavioral";

export type ParseResult = {
  messages: ParsedMessage[];
  detectedFormat: "fb-messenger";
  parseErrors: number;
};

type FBMessage = {
  sender_name: string;
  timestamp_ms: number;
  content?: string;
  type?: string;
  photos?: unknown[];
};

type FBExport = {
  participants: Array<{ name: string }>;
  messages: FBMessage[];
};

/**
 * FB Messenger JSON exports encode non-ASCII characters as Latin-1 bytes
 * stuffed into a UTF-8 string. This reverses the mojibake.
 */
function decodeFBString(str: string): string {
  try {
    return decodeURIComponent(escape(str));
  } catch {
    return str;
  }
}

export function parseFBMessengerExport(rawJson: string): ParseResult {
  const messages: ParsedMessage[] = [];
  let parseErrors = 0;

  let data: FBExport;
  try {
    data = JSON.parse(rawJson) as FBExport;
  } catch {
    return { messages: [], detectedFormat: "fb-messenger", parseErrors: 1 };
  }

  if (!Array.isArray(data.messages)) {
    return { messages: [], detectedFormat: "fb-messenger", parseErrors: 1 };
  }

  // FB Messenger exports are in reverse chronological order — sort ascending
  const sorted = [...data.messages].sort(
    (a, b) => a.timestamp_ms - b.timestamp_ms
  );

  for (const msg of sorted) {
    // Skip non-Generic messages (system messages) when the type field is present
    if (msg.type !== undefined && msg.type !== "Generic") {
      continue;
    }

    // Skip entries without text content (reactions, photos, shares, stickers)
    if (!msg.content) {
      continue;
    }

    const timestamp = new Date(msg.timestamp_ms);
    if (isNaN(timestamp.getTime())) {
      parseErrors++;
      continue;
    }

    messages.push({
      timestamp,
      sender: decodeFBString(msg.sender_name),
      body: decodeFBString(msg.content),
      isSystem: false,
    });
  }

  return { messages, detectedFormat: "fb-messenger", parseErrors };
}
