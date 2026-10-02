CREATE TABLE IF NOT EXISTS voice_personas (
  profile_id               TEXT PRIMARY KEY,
  vapi_call_id             TEXT UNIQUE,
  portrait                 TEXT NOT NULL DEFAULT '',
  structured_signals       TEXT NOT NULL DEFAULT '',
  voice_samples            TEXT NOT NULL DEFAULT '',
  transcript               TEXT,
  recording_url            TEXT,
  call_duration_seconds    INTEGER,
  ended_reason             TEXT,
  analysis_skipped         INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_voice_personas_call_id ON voice_personas(vapi_call_id);
