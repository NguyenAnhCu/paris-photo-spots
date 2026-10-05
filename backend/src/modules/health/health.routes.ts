import { Router } from 'express'
import { pool } from '../../db/pool.js'

export const healthRouter = Router()

// Deliberate exception to routes → service → repository: this probes infrastructure (DB + PostGIS reachable),
// it is not domain logic. Do not copy this pattern into domain modules.

healthRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query<{ postgis: string }>('SELECT postgis_version() AS postgis')
  res.json({ status: 'ok', postgis: rows[0]?.postgis ?? null })
})
