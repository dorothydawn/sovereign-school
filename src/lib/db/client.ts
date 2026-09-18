import postgres from 'postgres'
import type { SqlClient } from './runner'

let cached: SqlClient | null = null

/**
 * The application's database connection.
 *
 * Kept at a small pool size: this runs on serverless functions, where every
 * instance opens its own connections and a generous pool exhausts the database's
 * limit far sooner than you would expect.
 */
export function getDb(): SqlClient {
  if (cached) return cached

  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL is not set. See docs/setup.md, step 2.')

  const sql = postgres(url, { max: 3, idle_timeout: 20, onnotice: () => {} })

  cached = {
    async exec(statement: string) {
      await sql.unsafe(statement)
    },
    async rows<T>(statement: string, params: readonly unknown[] = []) {
      return (await sql.unsafe(statement, params as never[])) as unknown as T[]
    },
  }
  return cached
}
