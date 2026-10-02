#!/usr/bin/env node
/**
 * Read test-agents.local.json (produced by seed-test-agents.mjs) and upload
 * the credentials into the remote D1 database via the wrangler CLI.
 *
 * Idempotent: ON CONFLICT(agent_id) updates the api_key in place.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *     node scripts/upload-test-credentials.mjs [--local]
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const credsPath = join(REPO_ROOT, "test-agents.local.json");

const isLocal = process.argv.includes("--local");
const target = isLocal ? "--local" : "--remote";
const wrangler = join(REPO_ROOT, "node_modules", ".bin", "wrangler");

const data = JSON.parse(readFileSync(credsPath, "utf8"));
console.log(`[upload] ${data.count} credentials → D1 (${target})`);

// Build a single multi-statement SQL file to avoid 20 round-trips.
const lines = data.agents.map((a) => {
  const id = a.agentId.replace(/'/g, "''");
  const key = a.apiKey.replace(/'/g, "''");
  return `INSERT INTO test_agent_credentials (agent_id, api_key, is_active) VALUES ('${id}', '${key}', 1) ON CONFLICT(agent_id) DO UPDATE SET api_key = excluded.api_key, is_active = 1;`;
});

const sql = lines.join("\n");
const tmpFile = join(REPO_ROOT, ".test-creds-upload.sql");
import("node:fs").then((fs) => {
  fs.writeFileSync(tmpFile, sql);
  try {
    execFileSync(
      wrangler,
      ["d1", "execute", "clawnection-agentic-db", target, "--file", tmpFile],
      { stdio: "inherit", env: process.env },
    );
    console.log(`[upload] ✓ ${data.count} credentials uploaded`);
  } finally {
    fs.unlinkSync(tmpFile);
  }
});
