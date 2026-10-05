-- Up Migration
-- Wikidata QID kept so multilingual names (vi/en/fr) can be enriched later without re-matching POIs.
ALTER TABLE pois ADD COLUMN wikidata TEXT;

-- Lets external imports upsert idempotently: one live row per (source, source_ref), e.g. ('osm', 'node/123').
CREATE UNIQUE INDEX idx_pois_source_ref_unique ON pois (source, source_ref)
  WHERE deleted_at IS NULL AND source_ref IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_pois_source_ref_unique;
ALTER TABLE pois DROP COLUMN IF EXISTS wikidata;
