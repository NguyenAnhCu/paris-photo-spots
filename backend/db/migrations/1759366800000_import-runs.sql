-- Up Migration
-- One row per `npm run import` attempt: lets unattended runs be audited and lets the shrink guard
-- compare a new download with the last successful one (stats->'<source>'->>'fetched').
CREATE TABLE import_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  refresh BOOLEAN NOT NULL DEFAULT FALSE,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_import_runs_status_started_at ON import_runs (status, started_at DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_import_runs_updated_at BEFORE UPDATE ON import_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Down Migration
DROP TABLE IF EXISTS import_runs;
