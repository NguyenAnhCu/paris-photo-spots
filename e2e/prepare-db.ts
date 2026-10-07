// Runs before the E2E backend starts (playwright.config.ts): the database must be migrated first, because Better
// Auth checks the schema once at startup and refuses every sign-in after a mismatch until restarted.
import { prepareDatabase } from './support/db.js'

await prepareDatabase()
