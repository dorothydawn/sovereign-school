import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { enrol } from './enrol'
import { reconcileUnmapped } from './reconcile'
import { claim } from '@/lib/auth/claim'
import { accessibleCourses } from '@/lib/auth/access'

let db: PGlite
let client: SqlClient

const course = (id: string) => ({
  id,
  title: id,
  description: '',
  contentDir: id,
  videoHost: 'youtube' as const,
})

/** What the owner had configured when the purchase arrived. */
const before = {
  courses: [course('flagship')],
  productToCourses: { 'flagship-course': ['flagship'] },
} as unknown as CourseConfig

/** What they have after adding the mapping they had forgotten. */
const after = {
  courses: [course('flagship'), course('masterclass')],
  productToCourses: { 'flagship-course': ['flagship'], 'masterclass-2026': ['masterclass'] },
} as unknown as CourseConfig

const payload = {
  orderId: 'ord_1',
  email: 'a@b.com',
  productIds: ['masterclass-2026'],
  amountMinorUnits: 29700,
  currency: 'usd',
  purchasedAt: '2026-09-18T12:00:00.000Z',
}

beforeEach(async () => {
  db = new PGlite()
  client = pgliteClient(db)
  await runMigrations(client, join(process.cwd(), 'migrations'))
})
afterEach(async () => {
  await db.close()
})

describe('a product the owner maps only after somebody has bought it', () => {
  it('grants the access that the purchase should always have had', async () => {
    const enrolled = await enrol(client, before, payload)
    expect(enrolled.grantedCourseIds).toEqual([])
    expect(enrolled.unmappedProductIds).toEqual(['masterclass-2026'])

    const result = await reconcileUnmapped(client, after)

    expect(result.grantedCourseIds).toEqual(['masterclass'])
    expect(result.updatedEnrolmentIds).toEqual([enrolled.enrolmentId])
  })

  it('stops flagging the product once it is mapped', async () => {
    await enrol(client, before, payload)
    await reconcileUnmapped(client, after)

    const rows = await client.rows<{ unmapped_products: string[] }>(
      'SELECT unmapped_products FROM enrolments',
    )
    expect(rows[0]?.unmapped_products).toEqual([])
  })

  it('shows up in the student library without the funnel re-sending anything', async () => {
    // This is the promise the documentation makes to the owner.
    const enrolled = await enrol(client, before, payload)
    const claimed = await claim(client, enrolled.claimToken!)
    if (!claimed.ok) throw new Error('claim should have succeeded')

    expect(await accessibleCourses(client, before, claimed.accountId)).toEqual([])

    const courses = await accessibleCourses(client, after, claimed.accountId)
    expect(courses.map((c) => c.id)).toEqual(['masterclass'])
  })

  it('does nothing when there is nothing left over', async () => {
    await enrol(client, after, payload)
    const result = await reconcileUnmapped(client, after)
    expect(result.updatedEnrolmentIds).toEqual([])
    expect(result.grantedCourseIds).toEqual([])
  })

  it('keeps flagging a product that is still not mapped', async () => {
    await enrol(client, before, { ...payload, productIds: ['still-a-mystery'] })
    await reconcileUnmapped(client, after)

    const rows = await client.rows<{ unmapped_products: string[] }>(
      'SELECT unmapped_products FROM enrolments',
    )
    expect(rows[0]?.unmapped_products).toEqual(['still-a-mystery'])
  })

  it('does not reinstate access that was deliberately revoked', async () => {
    await enrol(client, after, payload)
    await client.rows(`UPDATE course_access SET state='revoked', revoked_at=now()`)
    await client.rows(`UPDATE enrolments SET unmapped_products = ARRAY['masterclass-2026']`)

    await reconcileUnmapped(client, after)

    const rows = await client.rows<{ state: string }>('SELECT state FROM course_access')
    expect(rows.map((r) => r.state)).toEqual(['revoked'])
  })
})
