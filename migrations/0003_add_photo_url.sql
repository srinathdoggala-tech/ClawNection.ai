-- Adds a profile photo URL (or data URI) to the simplified onboarding flow.
ALTER TABLE profiles ADD COLUMN photo_url TEXT;
