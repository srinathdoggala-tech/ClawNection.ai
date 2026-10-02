-- Adds contact + identity fields collected during the simplified onboarding flow.
-- Each ALTER is wrapped so re-running on a partially-migrated DB is safe.
ALTER TABLE profiles ADD COLUMN last_name       TEXT;
ALTER TABLE profiles ADD COLUMN phone_number    TEXT;
ALTER TABLE profiles ADD COLUMN occupation_type TEXT;
ALTER TABLE profiles ADD COLUMN occupation_place TEXT;
ALTER TABLE profiles ADD COLUMN instagram       TEXT;
ALTER TABLE profiles ADD COLUMN linkedin        TEXT;
