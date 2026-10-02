-- 0007 — soft-signal persona fields for the discriminating-evaluation
-- redesign. These fields give the verdict step something to react to in
-- the middle band between explicit dealbreakers and broad compatibility
-- signals — the band where most real first-date "no" verdicts live.
--
-- All nullable so existing rows continue to work. Only the experimental
-- borderline-fail test personas will populate them initially; the
-- agent's verdict prompt reads them when present.

ALTER TABLE profiles ADD COLUMN pet_peeves TEXT;             -- JSON array of strings
ALTER TABLE profiles ADD COLUMN current_life_context TEXT;   -- free-text "what's going on right now"
ALTER TABLE profiles ADD COLUMN wants_to_avoid TEXT;         -- JSON array of soft (non-dealbreaker) anti-preferences
ALTER TABLE profiles ADD COLUMN past_pattern_to_break TEXT;  -- free-text "kind of partner I keep choosing wrongly"
