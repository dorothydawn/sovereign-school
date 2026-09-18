import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Anything that can run SQL. Kept deliberately small so the same runner works
 * against a real Postgres connection and against PGlite in tests — the tests
 * exercise the migrations you actually ship, not a reimplementation of them.
 */
export interface SqlClient {
  /** Runs SQL with no parameters. For migrations and fixed statements only. */
  exec(sql: string): Promise<void>
  /**
   * Runs SQL with `$1`-style parameters and returns the rows.
   *
   * Anything derived from an HTTP request MUST arrive as a parameter. The enrol
   * endpoint takes an order id and an email straight from the network, and
   * interpolating either into SQL is how a stranger reads your accounts table.
   */
  rows<T>(sql: string, params?: readonly unknown[]): Promise<T[]>
}

export interface AppliedMigration {
  name: string
}

/** Migration filenames must sort into the order they should run. */
const MIGRATION_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/

export async function listMigrationFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir)
  const migrations = entries.filter((name) => MIGRATION_PATTERN.test(name))

  const ignored = entries.filter(
    (name) => name.endsWith('.sql') && !MIGRATION_PATTERN.test(name),
  )
  if (ignored.length > 0) {
    // Silently skipping a migration is how a table goes missing in production
    // while every test passes.
    throw new Error(
      `Migration files must look like 0001_name.sql. These do not, and would ` +
        `have been skipped: ${ignored.join(', ')}`,
    )
  }

  return migrations.sort()
}

/**
 * Applies any migration not yet recorded, in filename order, each in its own
 * transaction. Safe to run repeatedly — that is the point, since it runs on
 * every deploy.
 */
export async function runMigrations(client: SqlClient, dir: string): Promise<string[]> {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  const applied = new Set(
    (await client.rows<AppliedMigration>('SELECT name FROM _migrations')).map((r) => r.name),
  )

  const files = await listMigrationFiles(dir)
  const ran: string[] = []

  for (const file of files) {
    if (applied.has(file)) continue

    const sql = await readFile(join(dir, file), 'utf8')

    // One transaction per migration: a failure leaves the database on the last
    // complete migration rather than halfway through a broken one.
    await client.exec('BEGIN')
    try {
      await client.exec(sql)
      await client.exec(
        `INSERT INTO _migrations (name) VALUES ('${file.replace(/'/g, "''")}')`,
      )
      await client.exec('COMMIT')
    } catch (error) {
      await client.exec('ROLLBACK')
      throw new Error(`Migration ${file} failed and was rolled back: ${String(error)}`)
    }

    ran.push(file)
  }

  return ran
}
