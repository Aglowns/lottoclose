-- Convert all timestamp columns from TIMESTAMP (no zone) to TIMESTAMPTZ.
-- Backend writes ISO UTC strings; existing rows are interpreted as UTC, so
-- the conversion uses `AT TIME ZONE 'UTC'`. After this, SELECTs return
-- ISO strings with offsets, and the app's DateTime.parse + .toLocal() will
-- correctly render device-local times.

ALTER TABLE stores
  ALTER COLUMN trial_ends_at TYPE TIMESTAMPTZ USING trial_ends_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE users
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE invite_codes
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC',
  ALTER COLUMN used_at TYPE TIMESTAMPTZ USING used_at AT TIME ZONE 'UTC';

ALTER TABLE games
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE shifts
  ALTER COLUMN started_at TYPE TIMESTAMPTZ USING started_at AT TIME ZONE 'UTC',
  ALTER COLUMN closed_at TYPE TIMESTAMPTZ USING closed_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE shift_scans
  ALTER COLUMN scanned_at TYPE TIMESTAMPTZ USING scanned_at AT TIME ZONE 'UTC';

ALTER TABLE carryover
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
