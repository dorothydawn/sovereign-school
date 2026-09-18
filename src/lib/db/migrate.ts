/**
 * `npm run migrate`
 *
 * Applies any migration the database has not seen, in order. Safe to run
 * repeatedly — it is meant to run on every deploy.
 */
import postgres from 'postgres'
import { join } from 'node:path'
import { runMigrations, type SqlClient } from './runner'

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL']
  if (!url) {
    console.error(
      'DATABASE_URL is not set.\n\n' +
        'It is the connection string from your database provider, and it starts\n' +
        'with postgresql://. See docs/setup.md, step 2.',
    )
    process.exit(1)
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} })
  const client: SqlClient = {
    async exec(statement: string) {
      await sql.unsafe(statement)
    },
    async rows<T>(statement: string, params: readonly unknown[] = []) {
      return (await sql.unsafe(statement, params as never[])) as unknown as T[]
    },
  }

  try {
    const ran = await runMigrations(client, join(process.cwd(), 'migrations'))
    if (ran.length === 0) {
      console.log('Database is already up to date. Nothing to do.')
    } else {
      console.log(`Applied ${ran.length} migration(s):`)
      for (const name of ran) console.log(`  ${name}`)
    }
  } finally {
    await sql.end()
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed. The database was left unchanged.')
  console.error(error)
  process.exit(1)
})
