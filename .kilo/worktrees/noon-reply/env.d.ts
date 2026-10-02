/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  DB: D1Database;
  VAPI_WEBHOOK_SECRET: string;
  SCORING_WEIGHTS?: string;
  /**
   * Application-wide Master Key Encryption Key, base64-encoded 32 bytes
   * (AES-256). Used to wrap/unwrap each user's DEK. Must be set as a
   * Cloudflare secret in production:
   *
   *   wrangler secret put MASTER_KEK_B64
   */
  MASTER_KEK_B64?: string;
}
