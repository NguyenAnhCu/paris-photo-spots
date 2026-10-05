import type pg from 'pg'
import { upsertOutcome, type UpsertOutcome } from '../guards.js'

export type ImportedPoi = {
  source: string
  sourceRef: string
  name: string
  category: string
  lng: number
  lat: number
  tags: string[]
  description?: string | null
  website?: string | null
  openingHours?: string | null
  wikidata?: string | null
}

// Values another source added to this row (Muséofile enrichment, curated photo-spot match) are kept: their
// `museofile:*` / `curated:*` tags are re-appended and website/description fall back to the existing value.
// Columns owned by later steps (photo_category, popularity, crowd_level, cover…) are not touched here at all.
// The WHERE skips identical rows, so the outcome is a real inserted / updated / unchanged (see guards.ts).
const NEW_TAGS = `EXCLUDED.tags || ARRAY(SELECT t FROM unnest(pois.tags) t
                  WHERE (t LIKE 'museofile:%' OR t LIKE 'curated:%') AND NOT t = ANY(EXCLUDED.tags))`

export async function upsertPoi(client: pg.ClientBase, p: ImportedPoi): Promise<UpsertOutcome> {
  const { rows } = await client.query<{ inserted: boolean }>(
    `INSERT INTO pois (source, source_ref, name, category, tags, description, website, opening_hours, wikidata, geom)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ST_SetSRID(ST_MakePoint($10, $11), 4326))
     ON CONFLICT (source, source_ref) WHERE deleted_at IS NULL AND source_ref IS NOT NULL
     DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, tags = ${NEW_TAGS},
                   description = COALESCE(EXCLUDED.description, pois.description),
                   website = COALESCE(EXCLUDED.website, pois.website),
                   opening_hours = EXCLUDED.opening_hours, wikidata = EXCLUDED.wikidata, geom = EXCLUDED.geom
     WHERE (pois.name, pois.category, pois.tags, pois.description, pois.website, pois.opening_hours, pois.wikidata, pois.geom)
           IS DISTINCT FROM
           (EXCLUDED.name, EXCLUDED.category, ${NEW_TAGS}, COALESCE(EXCLUDED.description, pois.description),
            COALESCE(EXCLUDED.website, pois.website), EXCLUDED.opening_hours, EXCLUDED.wikidata, EXCLUDED.geom)
     RETURNING (xmax = 0) AS inserted`,
    [
      p.source,
      p.sourceRef,
      p.name,
      p.category,
      p.tags,
      p.description ?? null,
      p.website ?? null,
      p.openingHours ?? null,
      p.wikidata ?? null,
      p.lng,
      p.lat,
    ],
  )
  return upsertOutcome(rows)
}

// Rows of `source` that the latest download no longer contains are soft-deleted (project rule: never hard delete).
export async function softDeleteMissing(client: pg.ClientBase, source: string, keptRefs: string[]): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE pois SET deleted_at = NOW()
     WHERE source = $1 AND deleted_at IS NULL AND NOT (source_ref = ANY($2))`,
    [source, keptRefs],
  )
  return rowCount ?? 0
}
