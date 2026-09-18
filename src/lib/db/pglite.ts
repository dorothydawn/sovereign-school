import { PGlite } from '@electric-sql/pglite'
import type { SqlClient } from './runner'

/**
 * Postgres compiled to WebAssembly, running in this process. Lets `npm test`
 * exercise real SQL — real constraints, real types — with nothing installed.
 */
export function pgliteClient(db: PGlite): SqlClient {
  return {
    async exec(sql: string) {
      await db.exec(sql)
    },
    async rows<T>(sql: string) {
      const result = await db.query<T>(sql)
      return result.rows
    },
  }
}
