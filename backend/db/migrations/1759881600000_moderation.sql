-- Up Migration
-- Moderation (decision 2026-10-07): spots and photos posted by participants wait for a reviewer unless the author is
-- trusted. Public reads only ever see 'approved'. Imported spots and everything posted before this are approved.
ALTER TABLE pois
  ADD COLUMN status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN reviewed_by UUID,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD CONSTRAINT pois_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'hidden'));
CREATE INDEX idx_pois_status_pending ON pois (created_at) WHERE status = 'pending' AND deleted_at IS NULL;

-- gps_distance: how far the photo's own GPS position was from the spot, read before metadata is stripped and kept
-- only as a band (the coordinates themselves are never stored). phash: 64-bit difference hash, hex, to spot re-uploads.
ALTER TABLE photos
  ADD COLUMN status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN reviewed_by UUID,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN gps_distance TEXT,
  ADD COLUMN phash TEXT,
  ADD CONSTRAINT photos_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'hidden')),
  ADD CONSTRAINT photos_gps_distance_check CHECK (gps_distance IN ('lt200m', 'lt1km', 'far', 'none'));
CREATE INDEX idx_photos_status_pending ON photos (created_at) WHERE status = 'pending' AND deleted_at IS NULL;

-- Every reviewer decision, with its reason: shown to the author (why it was rejected) and to admins (who did what).
CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type TEXT NOT NULL CHECK (target_type IN ('spot', 'photo', 'report', 'user')),
  target_id UUID NOT NULL,
  action TEXT NOT NULL,
  reason_code TEXT,
  note TEXT,
  actor_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_moderation_actions_target ON moderation_actions (target_type, target_id, created_at DESC);
CREATE INDEX idx_moderation_actions_actor ON moderation_actions (actor_id, created_at DESC);

-- Reports now point at a spot or a photo (poi_id stays for the older point reports).
ALTER TABLE reports
  ADD COLUMN target_type TEXT CHECK (target_type IN ('spot', 'photo')),
  ADD COLUMN target_id UUID,
  ADD COLUMN reason_code TEXT,
  ADD COLUMN resolved_by UUID,
  ADD COLUMN resolved_at TIMESTAMPTZ;
CREATE INDEX idx_reports_open ON reports (created_at) WHERE status = 'open' AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_reports_open_unique ON reports (reporter_id, target_type, target_id)
  WHERE status = 'open' AND deleted_at IS NULL AND target_id IS NOT NULL;

-- Decisions on a user's content newer than this are shown as unread in the app.
ALTER TABLE users ADD COLUMN notifications_seen_at TIMESTAMPTZ;

-- Down Migration
-- Without the status column everything would show: take what was never approved out of public view first.
UPDATE pois SET deleted_at = NOW() WHERE status <> 'approved' AND deleted_at IS NULL;
UPDATE photos SET deleted_at = NOW() WHERE status <> 'approved' AND deleted_at IS NULL;
ALTER TABLE users DROP COLUMN IF EXISTS notifications_seen_at;
DROP INDEX IF EXISTS idx_reports_open_unique;
DROP INDEX IF EXISTS idx_reports_open;
ALTER TABLE reports
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS resolved_by,
  DROP COLUMN IF EXISTS reason_code,
  DROP COLUMN IF EXISTS target_id,
  DROP COLUMN IF EXISTS target_type;
DROP TABLE IF EXISTS moderation_actions;
DROP INDEX IF EXISTS idx_photos_status_pending;
ALTER TABLE photos
  DROP CONSTRAINT IF EXISTS photos_gps_distance_check,
  DROP CONSTRAINT IF EXISTS photos_status_check,
  DROP COLUMN IF EXISTS phash,
  DROP COLUMN IF EXISTS gps_distance,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS status;
DROP INDEX IF EXISTS idx_pois_status_pending;
ALTER TABLE pois
  DROP CONSTRAINT IF EXISTS pois_status_check,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS status;
