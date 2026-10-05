-- Up Migration
-- Photo-spot layer on top of the tourism POIs (decision 2026-10-05):
-- only rows with a photo_category are shown in the app; everything else stays for routing/transit features.
ALTER TABLE pois
  ADD COLUMN photo_category TEXT,
  ADD COLUMN popularity INT,
  ADD COLUMN crowd_level SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN best_time TEXT,
  ADD COLUMN tip TEXT,
  ADD COLUMN name_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN cover_photo_url TEXT,
  ADD COLUMN cover_photo_page_url TEXT,
  ADD COLUMN cover_photo_attribution TEXT;

CREATE INDEX idx_pois_photo_category ON pois (photo_category)
  WHERE deleted_at IS NULL AND photo_category IS NOT NULL;

-- Community photos. Files live on disk (STORAGE_DIR); no FK to pois, relationship handled in the app.
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poi_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  thumb_name TEXT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  author_name TEXT,
  focal TEXT,
  aperture TEXT,
  shutter TEXT,
  iso TEXT,
  camera TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_photos_poi_id ON photos (poi_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_deleted ON photos (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE TRIGGER trg_photos_updated_at BEFORE UPDATE ON photos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Down Migration
DROP TABLE IF EXISTS photos;
DROP INDEX IF EXISTS idx_pois_photo_category;
ALTER TABLE pois
  DROP COLUMN IF EXISTS photo_category,
  DROP COLUMN IF EXISTS popularity,
  DROP COLUMN IF EXISTS crowd_level,
  DROP COLUMN IF EXISTS best_time,
  DROP COLUMN IF EXISTS tip,
  DROP COLUMN IF EXISTS name_i18n,
  DROP COLUMN IF EXISTS cover_photo_url,
  DROP COLUMN IF EXISTS cover_photo_page_url,
  DROP COLUMN IF EXISTS cover_photo_attribution;
