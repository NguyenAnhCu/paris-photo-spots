-- Up Migration
-- Identities for participants, reviewers and admins (decision 2026-10-07). Sessions, linked sign-in methods and
-- verification codes follow the layout Better Auth reads (mapped to snake_case in src/modules/auth/auth.ts).
-- Better Auth deletes users and sessions for real (no deleted_at on its tables): erasing an account is a GDPR right.
-- Ids default in the database: Better Auth leaves them to Postgres when generateId is 'uuid'.

ALTER TABLE users
  DROP COLUMN password_hash,
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN image TEXT,
  ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN recovery_code_hash TEXT,
  ADD COLUMN posting_suspended_until TIMESTAMPTZ,
  ADD COLUMN terms_version TEXT,
  ADD COLUMN terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'participant';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('participant', 'reviewer', 'admin'));
CREATE UNIQUE INDEX idx_users_recovery_code_hash_unique ON users (recovery_code_hash) WHERE recovery_code_hash IS NOT NULL;

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_auth_sessions_token_unique ON auth_sessions (token);
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions (expires_at);

CREATE TABLE auth_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_auth_accounts_provider_account_unique ON auth_accounts (provider_id, account_id);
CREATE INDEX idx_auth_accounts_user_id ON auth_accounts (user_id);

CREATE TABLE auth_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_auth_verifications_identifier ON auth_verifications (identifier);

-- Who added a spot / photo. NULL = no owner: imported spots, and anything posted before accounts existed (those keep
-- the free-text author name they were posted with — showing them under the app's name would misattribute them).
ALTER TABLE pois ADD COLUMN created_by UUID;
CREATE INDEX idx_pois_created_by ON pois (created_by, created_at) WHERE deleted_at IS NULL AND created_by IS NOT NULL;
ALTER TABLE photos ADD COLUMN user_id UUID;
CREATE INDEX idx_photos_user_id ON photos (user_id, created_at) WHERE deleted_at IS NULL AND user_id IS NOT NULL;

-- Down Migration
-- Keep the shown author name on photos before owners disappear (accounts cannot survive without the auth tables).
UPDATE photos ph SET author_name = COALESCE(ph.author_name, u.display_name) FROM users u WHERE u.id = ph.user_id;
DROP INDEX IF EXISTS idx_photos_user_id;
ALTER TABLE photos DROP COLUMN IF EXISTS user_id;
DROP INDEX IF EXISTS idx_pois_created_by;
ALTER TABLE pois DROP COLUMN IF EXISTS created_by;
DROP TABLE IF EXISTS auth_verifications;
DROP TABLE IF EXISTS auth_accounts;
DROP TABLE IF EXISTS auth_sessions;
DELETE FROM users;
DROP INDEX IF EXISTS idx_users_recovery_code_hash_unique;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'contributor';
ALTER TABLE users ALTER COLUMN display_name DROP NOT NULL;
ALTER TABLE users
  DROP COLUMN IF EXISTS terms_accepted_at,
  DROP COLUMN IF EXISTS terms_version,
  DROP COLUMN IF EXISTS posting_suspended_until,
  DROP COLUMN IF EXISTS recovery_code_hash,
  DROP COLUMN IF EXISTS is_anonymous,
  DROP COLUMN IF EXISTS image,
  DROP COLUMN IF EXISTS email_verified,
  ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ALTER COLUMN password_hash DROP DEFAULT;
