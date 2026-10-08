-- Up Migration
-- Staff (reviewers, admins) sign in with a username and a password (decision 2026-10-08, replaces sign-in links).
-- The password hash lives in auth_accounts.password (provider 'credential'). Usernames are stored lower-case;
-- display_username keeps the spelling given.
ALTER TABLE users
  ADD COLUMN username TEXT,
  ADD COLUMN display_username TEXT;
CREATE UNIQUE INDEX idx_users_username_unique ON users (username) WHERE username IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_users_username_unique;
DELETE FROM auth_accounts WHERE provider_id = 'credential';
ALTER TABLE users
  DROP COLUMN IF EXISTS display_username,
  DROP COLUMN IF EXISTS username;
