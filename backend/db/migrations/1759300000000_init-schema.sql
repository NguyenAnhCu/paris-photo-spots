-- Up Migration
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'contributor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_users_email_unique ON users (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_regions_code_unique ON regions (code) WHERE deleted_at IS NULL;
CREATE INDEX idx_regions_type ON regions (type) WHERE deleted_at IS NULL;
CREATE INDEX idx_regions_geom ON regions USING GIST (geom) WHERE deleted_at IS NULL;

CREATE TABLE user_region_scopes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  region_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_user_region_scopes_user_id ON user_region_scopes (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_region_scopes_region_id ON user_region_scopes (region_id) WHERE deleted_at IS NULL;

CREATE TABLE transit_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gtfs_stop_id TEXT,
  name TEXT NOT NULL,
  modes TEXT[] NOT NULL DEFAULT '{}',
  lines TEXT[] NOT NULL DEFAULT '{}',
  navigo_zone SMALLINT,
  wheelchair BOOLEAN,
  geom geometry(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_transit_stops_gtfs_stop_id_unique ON transit_stops (gtfs_stop_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_transit_stops_geom ON transit_stops USING GIST (geom) WHERE deleted_at IS NULL;

CREATE TABLE pois (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  opening_hours TEXT,
  price_level SMALLINT,
  website TEXT,
  navigo_zone SMALLINT,
  nearest_stop_id UUID,
  walk_minutes SMALLINT,
  source TEXT,
  source_ref TEXT,
  geom geometry(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_pois_category ON pois (category) WHERE deleted_at IS NULL;
CREATE INDEX idx_pois_nearest_stop_id ON pois (nearest_stop_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pois_geom ON pois USING GIST (geom) WHERE deleted_at IS NULL;
-- Serves ST_DWithin(geom::geography, ...): the query expression must match this one exactly.
CREATE INDEX idx_pois_geog ON pois USING GIST ((geom::geography)) WHERE deleted_at IS NULL;
CREATE INDEX idx_pois_deleted ON pois (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE itineraries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  summary TEXT,
  days SMALLINT NOT NULL DEFAULT 1,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_itineraries_owner_id ON itineraries (owner_id) WHERE deleted_at IS NULL;

CREATE TABLE itinerary_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL,
  poi_id UUID NOT NULL,
  day_index SMALLINT NOT NULL,
  position SMALLINT NOT NULL,
  transit_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_itinerary_stops_itinerary_id ON itinerary_stops (itinerary_id, day_index, position) WHERE deleted_at IS NULL;
CREATE INDEX idx_itinerary_stops_poi_id ON itinerary_stops (poi_id) WHERE deleted_at IS NULL;

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL,
  poi_id UUID,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  geom geometry(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_reports_reporter_id ON reports (reporter_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_poi_id ON reports (poi_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_status ON reports (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_geom ON reports USING GIST (geom) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_regions_updated_at BEFORE UPDATE ON regions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_region_scopes_updated_at BEFORE UPDATE ON user_region_scopes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transit_stops_updated_at BEFORE UPDATE ON transit_stops FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pois_updated_at BEFORE UPDATE ON pois FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_itineraries_updated_at BEFORE UPDATE ON itineraries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_itinerary_stops_updated_at BEFORE UPDATE ON itinerary_stops FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Down Migration
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS itinerary_stops;
DROP TABLE IF EXISTS itineraries;
DROP TABLE IF EXISTS pois;
DROP TABLE IF EXISTS transit_stops;
DROP TABLE IF EXISTS user_region_scopes;
DROP TABLE IF EXISTS regions;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS update_updated_at();
