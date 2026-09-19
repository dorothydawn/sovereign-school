import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from './pglite'
import { runMigrations } from './runner'

const MIGRATIONS = join(process.cwd(), 'migrations')

let db: PGlite

beforeEach(async () => {
  db = new PGlite()
})
afterEach(async () => {
  await db.close()
})

describe('the migration runner', () => {
  it('applies migrations and records them', async () => {
    const ran = await runMigrations(pgliteClient(db), MIGRATIONS)
    expect(ran).toContain('0001_initial.sql')

    const applied = await db.query<{ name: string }>('SELECT name FROM _migrations')
    expect(applied.rows.map((r) => r.name)).toEqual(ran)
  })

  it('does nothing on a second run', async () => {
    const client = pgliteClient(db)
    await runMigrations(client, MIGRATIONS)
    // This runs on every deploy. If it were not a no-op it would fail the deploy.
    expect(await runMigrations(client, MIGRATIONS)).toEqual([])
  })
})

describe('the schema the migrations actually produce', () => {
  beforeEach(async () => {
    await runMigrations(pgliteClient(db), MIGRATIONS)
  })

  it('refuses a second enrolment for the same order', async () => {
    // The funnel confirms payments from two racing sources and retries on top.
    // Without this constraint the same customer is enrolled repeatedly.
    const insert = (order: string) =>
      db.query(
        `INSERT INTO enrolments (order_id, product_ids, purchased_at)
         VALUES ('${order}', ARRAY['course-x'], now())`,
      )

    await insert('ord_1')
    await expect(insert('ord_1')).rejects.toThrow()
  })

  it('accepts an enrolment with no email at all', async () => {
    // The funnel does not require an email to take payment.
    await db.query(
      `INSERT INTO enrolments (order_id, email, product_ids, purchased_at)
       VALUES ('ord_2', NULL, ARRAY['course-x'], now())`,
    )
    const rows = await db.query<{ email: string | null }>(
      `SELECT email FROM enrolments WHERE order_id = 'ord_2'`,
    )
    expect(rows.rows[0]?.email).toBeNull()
  })

  it('allows more than one account with no email', async () => {
    // email is UNIQUE. In Postgres, NULLs do not collide — but if that ever
    // changed, the second student to buy without an email would be rejected
    // after paying.
    await db.query(`INSERT INTO accounts (email) VALUES (NULL)`)
    await db.query(`INSERT INTO accounts (email) VALUES (NULL)`)
    // count(*) is cast explicitly: PGlite returns bigint as a JS number while
    // node-postgres returns it as a string, so an uncast count means tests and
    // production disagree about the type. ::int returns a number in both.
    const rows = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM accounts`)
    expect(rows.rows[0]?.count).toBe(2)
  })

  it('still rejects two accounts sharing a real email', async () => {
    await db.query(`INSERT INTO accounts (email) VALUES ('a@b.com')`)
    await expect(
      db.query(`INSERT INTO accounts (email) VALUES ('a@b.com')`),
    ).rejects.toThrow()
  })

  it('can revoke access without deleting the record of the purchase', async () => {
    await db.query(
      `INSERT INTO enrolments (id, order_id, product_ids, purchased_at)
       VALUES ('11111111-1111-1111-1111-111111111111', 'ord_3', ARRAY['course-x'], now())`,
    )
    await db.query(
      `INSERT INTO course_access (enrolment_id, course_id)
       VALUES ('11111111-1111-1111-1111-111111111111', 'flagship')`,
    )
    await db.query(
      `UPDATE course_access SET state = 'revoked', revoked_at = now() WHERE course_id = 'flagship'`,
    )
    const rows = await db.query<{ state: string }>(`SELECT state FROM course_access`)
    expect(rows.rows[0]?.state).toBe('revoked')

    // The enrolment survives, so turning the refund policy on later is a config
    // change rather than lost history.
    const enrolments = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM enrolments`,
    )
    expect(enrolments.rows[0]?.count).toBe(1)
  })

  it('rejects an access state that is neither active nor revoked', async () => {
    await db.query(
      `INSERT INTO enrolments (id, order_id, product_ids, purchased_at)
       VALUES ('22222222-2222-2222-2222-222222222222', 'ord_4', ARRAY['c'], now())`,
    )
    await expect(
      db.query(
        `INSERT INTO course_access (enrolment_id, course_id, state)
         VALUES ('22222222-2222-2222-2222-222222222222', 'c', 'sort-of')`,
      ),
    ).rejects.toThrow()
  })

  it('keeps one progress row per student per lesson, however often it is written', async () => {
    const account = await db.query<{ id: string }>(
      `INSERT INTO accounts (email) VALUES ('p@q.com') RETURNING id`,
    )
    const id = account.rows[0]?.id
    expect(id).toBeDefined()

    for (const position of [30, 90, 240]) {
      await db.query(
        `INSERT INTO progress (account_id, course_id, lesson_id, video_position)
         VALUES ('${id}', 'flagship', 'lesson-1', ${position})
         ON CONFLICT (account_id, course_id, lesson_id)
         DO UPDATE SET video_position = EXCLUDED.video_position, updated_at = now()`,
      )
    }

    const rows = await db.query<{ count: number; video_position: number }>(
      `SELECT count(*)::int AS count, max(video_position) AS video_position FROM progress`,
    )
    expect(rows.rows[0]?.count).toBe(1)
    expect(rows.rows[0]?.video_position).toBe(240)
  })

  it('hides a new comment until it is approved', async () => {
    const account = await db.query<{ id: string }>(
      `INSERT INTO accounts (email) VALUES ('c@d.com') RETURNING id`,
    )
    await db.query(
      `INSERT INTO comments (account_id, course_id, lesson_id, body)
       VALUES ('${account.rows[0]?.id}', 'flagship', 'lesson-1', 'Great lesson')`,
    )
    const rows = await db.query<{ state: string }>(`SELECT state FROM comments`)
    expect(rows.rows[0]?.state).toBe('pending')
  })

  it('counts a five-minute bucket once however many queries land in it', async () => {
    // The usage estimate is only useful if repeated activity in one window does
    // not inflate it.
    for (let i = 0; i < 5; i++) {
      await db.query(
        `INSERT INTO db_activity (bucket) VALUES (date_trunc('hour', now()))
         ON CONFLICT (bucket) DO NOTHING`,
      )
    }
    const rows = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM db_activity`,
    )
    expect(rows.rows[0]?.count).toBe(1)
  })
})

describe('migration file naming', () => {
  it('refuses to run rather than silently skip a badly named file', async () => {
    // A skipped migration is a missing table in production and a green suite
    // everywhere else, so this fails loudly instead.
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(join(tmpdir(), 'migrations-'))
    await writeFile(join(dir, '0001_fine.sql'), 'SELECT 1;')
    await writeFile(join(dir, 'oops.sql'), 'SELECT 1;')

    await expect(runMigrations(pgliteClient(db), dir)).rejects.toThrow(/oops\.sql/)
  })
})
