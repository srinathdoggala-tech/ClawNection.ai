-- Profiles (replaces localStorage clawnection.profile.v1)
CREATE TABLE IF NOT EXISTS profiles (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  age                 INTEGER,
  gender_identity     TEXT,
  looking_for         TEXT,
  location            TEXT,
  relationship_intent TEXT,
  bio                 TEXT,
  interests           TEXT,
  profile_values      TEXT,
  communication_style TEXT,
  lifestyle_habits    TEXT,
  dealbreakers        TEXT,
  ideal_first_date    TEXT,
  preference_age_min  INTEGER,
  preference_age_max  INTEGER,
  preference_notes    TEXT,
  agent_type          TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- Signal bundles (replaces localStorage clawnection.signals.v1)
CREATE TABLE IF NOT EXISTS signal_bundles (
  id                   TEXT PRIMARY KEY,
  profile_id           TEXT NOT NULL REFERENCES profiles(id),
  signals_json         TEXT NOT NULL,
  file_count           INTEGER,
  total_user_messages  INTEGER,
  created_at           TEXT DEFAULT (datetime('now'))
);

-- Self-awareness gap (internal only — never surfaced to users)
CREATE TABLE IF NOT EXISTS self_awareness_gaps (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id),
  gap_json   TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Match results (replaces localStorage clawnection.lastResult.v1)
CREATE TABLE IF NOT EXISTS match_results (
  id                  TEXT PRIMARY KEY,
  profile_a_id        TEXT NOT NULL REFERENCES profiles(id),
  profile_b_id        TEXT NOT NULL,
  compatibility_score INTEGER,
  verdict             TEXT,
  result_json         TEXT NOT NULL,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- Negotiation sessions (Layer 3 foundation)
CREATE TABLE IF NOT EXISTS negotiation_sessions (
  id              TEXT PRIMARY KEY,
  profile_a_id    TEXT NOT NULL REFERENCES profiles(id),
  profile_b_id    TEXT NOT NULL,
  status          TEXT DEFAULT 'initiated',
  policy_version  TEXT DEFAULT '1.0',
  result_json     TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  completed_at    TEXT
);

-- Negotiation messages (typed protocol log)
CREATE TABLE IF NOT EXISTS negotiation_messages (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES negotiation_sessions(id),
  sender_id       TEXT,
  message_type    TEXT,
  payload_json    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signal_bundles_profile    ON signal_bundles(profile_id);
CREATE INDEX IF NOT EXISTS idx_match_results_profile_a   ON match_results(profile_a_id);
CREATE INDEX IF NOT EXISTS idx_neg_sessions_profiles     ON negotiation_sessions(profile_a_id, profile_b_id);
CREATE INDEX IF NOT EXISTS idx_neg_messages_session      ON negotiation_messages(session_id);
