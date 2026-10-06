-- Derived fields for every live POI, recomputed after each import.
--   WALK_M_PER_MIN = 80   (≈ 4.8 km/h)
--   MAX_WALK_M     = 2000 (beyond this the nearest station is not "walkable": walk_minutes stays NULL)
-- Day trips are not derived here: they come from the curated Wikidata list in day-trips.ts (see run.ts).
-- Only rows whose values actually change are written, so a re-run keeps every row (and its updated_at) as is.

-- Nearest station. KNN on geometry (degrees) is only approximate at Paris latitude, so take the 5 nearest
-- by index and pick the true closest one by geography distance (metres).
UPDATE pois p
SET nearest_stop_id = m.stop_id,
    navigo_zone = m.navigo_zone,
    walk_minutes = CASE WHEN m.distance_m <= 2000 THEN CEIL(m.distance_m / 80.0) END
FROM (
  SELECT p2.id AS poi_id, best.stop_id, best.navigo_zone, best.distance_m
  FROM pois p2
  CROSS JOIN LATERAL (
    SELECT c.id AS stop_id, c.navigo_zone, ST_Distance(c.geom::geography, p2.geom::geography) AS distance_m
    FROM (
      SELECT s.id, s.navigo_zone, s.geom
      FROM transit_stops s
      WHERE s.deleted_at IS NULL
      ORDER BY s.geom <-> p2.geom
      LIMIT 5
    ) c
    ORDER BY distance_m
    LIMIT 1
  ) best
  WHERE p2.deleted_at IS NULL
) m
WHERE p.id = m.poi_id
  AND (p.nearest_stop_id, p.navigo_zone, p.walk_minutes)
      IS DISTINCT FROM (m.stop_id, m.navigo_zone, CASE WHEN m.distance_m <= 2000 THEN CEIL(m.distance_m / 80.0) END);
