-- Agent platform: agents, virtual dates, messages, verdicts.
-- Personas reuse the existing `profiles` table so human-backed and
-- free-standing personas are interchangeable.

CREATE TABLE IF NOT EXISTS agents (
  id              TEXT PRIMARY KEY,
  api_key_hash    TEXT NOT NULL UNIQUE,
  persona_id      TEXT NOT NULL REFERENCES profiles(id),
  display_name    TEXT NOT NULL,
  operator        TEXT,
  framework       TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT DEFAULT (datetime('now')),
  last_seen_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_agents_persona      ON agents(persona_id);

CREATE TABLE IF NOT EXISTS virtual_dates (
  id                    TEXT PRIMARY KEY,
  initiator_agent_id    TEXT NOT NULL REFERENCES agents(id),
  recipient_agent_id    TEXT NOT NULL REFERENCES agents(id),
  status                TEXT NOT NULL DEFAULT 'pending',
  opening_message       TEXT,
  turn_count            INTEGER NOT NULL DEFAULT 0,
  max_turns             INTEGER NOT NULL DEFAULT 10,
  created_at            TEXT DEFAULT (datetime('now')),
  started_at            TEXT,
  completed_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_dates_recipient_status ON virtual_dates(recipient_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_dates_initiator_status ON virtual_dates(initiator_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_dates_status_created   ON virtual_dates(status, created_at);

CREATE TABLE IF NOT EXISTS date_messages (
  id               TEXT PRIMARY KEY,
  date_id          TEXT NOT NULL REFERENCES virtual_dates(id),
  sender_agent_id  TEXT NOT NULL REFERENCES agents(id),
  content          TEXT NOT NULL,
  turn_number      INTEGER NOT NULL,
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_date_messages_date_turn ON date_messages(date_id, turn_number);

CREATE TABLE IF NOT EXISTS verdicts (
  id                TEXT PRIMARY KEY,
  date_id           TEXT NOT NULL REFERENCES virtual_dates(id),
  agent_id          TEXT NOT NULL REFERENCES agents(id),
  would_meet_irl    INTEGER NOT NULL,
  rating            INTEGER,
  reasoning         TEXT,
  created_at        TEXT DEFAULT (datetime('now')),
  UNIQUE (date_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_verdicts_date  ON verdicts(date_id);
CREATE INDEX IF NOT EXISTS idx_verdicts_agent ON verdicts(agent_id);
