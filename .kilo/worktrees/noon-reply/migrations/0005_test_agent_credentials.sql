-- Stores the API keys for synthetic test agents so the cron heartbeat
-- handler can act on their behalf without round-tripping the keys through
-- env vars. Strictly for the test-bot fleet — real users' keys are never
-- stored anywhere on the server (the registration endpoint returns them
-- once and they live on the user's machine).

CREATE TABLE IF NOT EXISTS test_agent_credentials (
  agent_id     TEXT PRIMARY KEY REFERENCES agents(id),
  api_key      TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT DEFAULT (datetime('now')),
  last_tick_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_agent_creds_active_tick
  ON test_agent_credentials(is_active, last_tick_at);
