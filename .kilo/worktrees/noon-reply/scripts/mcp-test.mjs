#!/usr/bin/env node
/**
 * Smoke test for scripts/mcp-server.mjs.
 *
 * Spawns the server as a child process, speaks JSON-RPC over its stdio:
 *   1. initialize handshake
 *   2. tools/list — should return all 10 tools
 *   3. tools/call clawnection_view_directory — should return real data from
 *      the deployed worker
 *   4. tools/call clawnection_read_self — should succeed if API key is set
 *
 * No external dependencies. Run with:
 *   node scripts/mcp-test.mjs
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "mcp-server.mjs");

const child = spawn("node", [SERVER_PATH], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

child.stderr.on("data", (chunk) => {
  // The MCP server itself shouldn't write to stderr unless something's wrong;
  // mirror it for debugging.
  process.stderr.write(`[server stderr] ${chunk}`);
});

let buffer = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error("[test] non-JSON from server:", line);
      continue;
    }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }
});

function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    child.stdin.write(payload + "\n");
  });
}

async function main() {
  const log = (...a) => console.log("[test]", ...a);

  log("→ initialize");
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp-test", version: "1.0.0" },
  });
  log("server:", init.serverInfo.name, init.serverInfo.version);

  // After initialize, send the initialized notification (no id, no response).
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }) + "\n",
  );

  log("→ tools/list");
  const list = await rpc("tools/list");
  const names = list.tools.map((t) => t.name).sort();
  log(`tools found (${names.length}):`);
  for (const n of names) console.log("    -", n);
  if (names.length < 9) {
    console.error("[test FAIL] expected at least 9 tools, got", names.length);
    process.exit(1);
  }

  log("→ tools/call clawnection_view_directory (no auth needed)");
  const dir = await rpc("tools/call", {
    name: "clawnection_view_directory",
    arguments: {},
  });
  if (dir.isError) {
    console.error("[test FAIL] view_directory errored:", dir.content);
    process.exit(1);
  }
  const dirText = dir.content?.[0]?.text ?? "";
  const dirData = JSON.parse(dirText);
  log(`  → directory.count = ${dirData.count}`);

  if (process.env.CLAWNECTION_API_KEY) {
    log("→ tools/call clawnection_read_self (with API key)");
    const me = await rpc("tools/call", {
      name: "clawnection_read_self",
      arguments: {},
    });
    if (me.isError) {
      console.error("[test FAIL] read_self errored:", me.content);
      process.exit(1);
    }
    const meData = JSON.parse(me.content[0].text);
    log(
      `  → agent ${meData.agent.id} representing ${meData.persona.name} (age ${meData.persona.age})`,
    );

    log("→ tools/call clawnection_get_inbox");
    const inbox = await rpc("tools/call", {
      name: "clawnection_get_inbox",
      arguments: {},
    });
    if (inbox.isError) {
      console.error("[test FAIL] get_inbox errored:", inbox.content);
      process.exit(1);
    }
    const ix = JSON.parse(inbox.content[0].text);
    log(
      `  → pending ${ix.pendingInvites.length} · active ${ix.activeDates.length} · awaiting verdict ${ix.awaitingMyVerdict.length}`,
    );
  } else {
    log("(skipping authed tool calls — CLAWNECTION_API_KEY not set)");
  }

  console.log("\n=========================================");
  console.log("MCP SMOKE TEST PASSED");
  console.log("=========================================");
  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("[test FAIL]", err);
  child.kill();
  process.exit(1);
});
