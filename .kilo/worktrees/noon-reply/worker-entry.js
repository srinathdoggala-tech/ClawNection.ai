// Custom worker entry that wraps the OpenNext-generated worker so we can add
// a Cloudflare Cron Trigger `scheduled()` handler alongside the normal
// `fetch()` handler. The fetch behavior is delegated unchanged to OpenNext.
//
// `.open-next/worker.js` is produced by `opennextjs-cloudflare build`; wrangler
// bundles this entry (and its transitive imports) at deploy time.

//@ts-expect-error: resolved by wrangler bundling at deploy time
import openNextHandler from "./.open-next/worker.js";

// Re-export the durable-object classes from the OpenNext worker so the
// bundle still exposes them. None are bound today, but OpenNext emits these
// by default and future caching/queue features may rely on them.
//@ts-expect-error: resolved by wrangler bundling at deploy time
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const HEARTBEAT_PATH = "/api/cron-heartbeat?limit=10";

async function runScheduledHeartbeat(env) {
  const secret = env.CRON_HEARTBEAT_SECRET;
  if (!secret) {
    console.error("[cron] CRON_HEARTBEAT_SECRET not set; skipping heartbeat tick");
    return;
  }
  const selfRef = env.WORKER_SELF_REFERENCE;
  if (!selfRef || typeof selfRef.fetch !== "function") {
    console.error("[cron] WORKER_SELF_REFERENCE binding missing; skipping heartbeat tick");
    return;
  }
  const start = Date.now();
  try {
    // Host doesn't matter — the service binding routes to this worker
    // regardless. The cron-heartbeat route only consumes the pathname.
    const req = new Request(`https://internal${HEARTBEAT_PATH}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const res = await selfRef.fetch(req);
    const elapsed = Date.now() - start;
    const body = await res.text();
    if (!res.ok) {
      console.error(
        `[cron] heartbeat HTTP ${res.status} in ${elapsed}ms: ${body.slice(0, 500)}`,
      );
      return;
    }
    console.log(`[cron] heartbeat OK in ${elapsed}ms: ${body.slice(0, 500)}`);
  } catch (err) {
    console.error(`[cron] heartbeat threw after ${Date.now() - start}ms:`, err);
  }
}

export default {
  fetch(request, env, ctx) {
    return openNextHandler.fetch(request, env, ctx);
  },
  scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduledHeartbeat(env));
  },
};
