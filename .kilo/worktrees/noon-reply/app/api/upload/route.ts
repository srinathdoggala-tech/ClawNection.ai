import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import JSZip from "jszip";
import { parseWhatsAppExport } from "@/lib/whatsapp/parser";
import { parseFBMessengerExport } from "@/lib/messenger/parser";
import { extractSignals, mergeSignals } from "@/lib/whatsapp/signals";
import { WhatsAppSignals } from "@/lib/types/behavioral";


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const profileId = formData.get("profileId");
    const userName = formData.get("userName");

    if (!profileId || typeof profileId !== "string") {
      return NextResponse.json(
        { error: "profileId is required" },
        { status: 400 },
      );
    }
    if (!userName || typeof userName !== "string") {
      return NextResponse.json(
        { error: "userName is required" },
        { status: 400 },
      );
    }

    const files = formData.getAll("files");
    if (files.length === 0) {
      return NextResponse.json(
        { error: "At least one file is required" },
        { status: 400 },
      );
    }

    const allSignals: WhatsAppSignals[] = [];
    const sourcesUsed = new Set<string>();

    for (const entry of files) {
      if (!(entry instanceof File)) {
        continue;
      }

      const fileName = entry.name.toLowerCase();

      if (fileName.endsWith(".zip")) {
        // Extract .txt and .json files from the zip
        const arrayBuffer = await entry.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        for (const [zipFileName, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) continue;
          const lowerZipName = zipFileName.toLowerCase();

          if (lowerZipName.endsWith(".txt") || lowerZipName.endsWith(".json")) {
            const text = await zipEntry.async("text");
            const signals = parseAndExtract(
              text,
              lowerZipName,
              userName,
              sourcesUsed,
            );
            if (signals) {
              allSignals.push(signals);
            }
          }
        }
      } else {
        const text = await entry.text();
        const signals = parseAndExtract(text, fileName, userName, sourcesUsed);
        if (signals) {
          allSignals.push(signals);
        }
      }
    }

    if (allSignals.length === 0) {
      return NextResponse.json(
        {
          error:
            "No messages could be extracted from the uploaded files. Ensure files are WhatsApp (.txt) or FB Messenger (.json) exports.",
        },
        { status: 400 },
      );
    }

    const mergedSignals = mergeSignals(allSignals);
    const source = [...sourcesUsed].join(",");

    // Store in D1 — only the extracted signals JSON, never raw chat text
    const { env } = getCloudflareContext();
    const db = (env as unknown as CloudflareEnv).DB;
    const id = crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO signal_bundles (id, profile_id, signals_json, file_count, total_user_messages, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        id,
        profileId,
        JSON.stringify(mergedSignals),
        allSignals.length,
        mergedSignals.userMessageCount,
        source,
      )
      .run();

    return NextResponse.json({
      ok: true,
      id,
      signals: mergedSignals,
      source,
      fileCount: allSignals.length,
    });
  } catch (err) {
    console.error("Upload parse/extract failure:", err);
    return NextResponse.json(
      { error: "Internal server error while processing upload" },
      { status: 500 },
    );
  }
}

function parseAndExtract(
  text: string,
  fileName: string,
  userName: string,
  sourcesUsed: Set<string>,
): WhatsAppSignals | null {
  if (fileName.endsWith(".json")) {
    const { messages, detectedFormat, parseErrors } =
      parseFBMessengerExport(text);
    if (messages.length === 0) return null;

    const source = "fb-messenger-export";
    sourcesUsed.add(source);

    return extractSignals(messages, userName, {
      extractionMetadata: {
        source,
        fileCount: 1,
        parseErrors,
        detectedFormats: [detectedFormat],
      },
    });
  }

  if (fileName.endsWith(".txt")) {
    const { messages, detectedFormat, parseErrors } =
      parseWhatsAppExport(text);
    if (messages.length === 0) return null;

    const source = "whatsapp-export";
    sourcesUsed.add(source);

    return extractSignals(messages, userName, {
      extractionMetadata: {
        source,
        fileCount: 1,
        parseErrors,
        detectedFormats: [detectedFormat],
      },
    });
  }

  // Unsupported file type inside zip — skip silently
  return null;
}
