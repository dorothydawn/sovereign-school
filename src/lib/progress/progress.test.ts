import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import {
  courseProgress,
  percentComplete,
  resumeLessonId,
  setCompleted,
  setPosition,
} from './progress'

let db: PGlite
let client: SqlClient
let account: string

beforeEach(async () => {
  db = new PGlite()
  client = pgliteClient(db)
  await runMigrations(client, join(process.cwd(), 'migrations'))
  const rows = await client.rows<{ id: string }>(
    `INSERT INTO accounts (email) VALUES ('a@b.com') RETURNING id`,
  )
  account = rows[0]!.id
})
afterEach(async () => {
  await db.close()
})

const rowCount = async (): Promise<number> => {
  const rows = await client.rows<{ c: number }>(`SELECT count(*)::int AS c FROM progress`)
  return rows[0]?.c ?? -1
}

describe('marking a lesson done', () => {
  it('records it', async () => {
    await setCompleted(client, account, 'flagship', 'lesson-1', true)
    const progress = await courseProgress(client, account, 'flagship')
    expect(progress.get('lesson-1')?.completed).toBe(true)
  })

  it('can be undone', async () => {
    await setCompleted(client, account, 'flagship', 'lesson-1', true)
    await setCompleted(client, account, 'flagship', 'lesson-1', false)
    const progress = await courseProgress(client, account, 'flagship')
    expect(progress.get('lesson-1')?.completed).toBe(false)
  })

  it('keeps one row however many times it is clicked', async () => {
    for (let i = 0; i < 20; i++) {
      await setCompleted(client, account, 'flagship', 'lesson-1', i % 2 === 0)
    }
    expect(await rowCount()).toBe(1)
  })

  it('keeps the original completion time when marked done again', async () => {
    await setCompleted(client, account, 'flagship', 'lesson-1', true)
    const first = await client.rows<{ completed_at: string }>(
      `SELECT completed_at FROM progress`,
    )
    await setCompleted(client, account, 'flagship', 'lesson-1', true)
    const second = await client.rows<{ completed_at: string }>(
      `SELECT completed_at FROM progress`,
    )
    expect(second[0]?.completed_at).toEqual(first[0]?.completed_at)
  })

  it('does not leak between courses', async () => {
    await setCompleted(client, account, 'flagship', 'lesson-1', true)
    const other = await courseProgress(client, account, 'bonus')
    expect(other.size).toBe(0)
  })
})

describe('remembering where somebody stopped watching', () => {
  it('stores the position', async () => {
    await setPosition(client, account, 'flagship', 'lesson-1', 245)
    const progress = await courseProgress(client, account, 'flagship')
    expect(progress.get('lesson-1')?.position).toBe(245)
  })

  it('still keeps one row per lesson', async () => {
    for (const seconds of [10, 20, 30, 40]) {
      await setPosition(client, account, 'flagship', 'lesson-1', seconds)
    }
    expect(await rowCount()).toBe(1)
  })

  it('refuses nonsense from the browser', async () => {
    // This value arrives from a page the student can edit.
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await setPosition(client, account, 'flagship', 'lesson-1', bad)
      const progress = await courseProgress(client, account, 'flagship')
      expect(progress.get('lesson-1')?.position).toBe(0)
    }
  })

  it('rounds to whole seconds', async () => {
    await setPosition(client, account, 'flagship', 'lesson-1', 12.9)
    const progress = await courseProgress(client, account, 'flagship')
    expect(progress.get('lesson-1')?.position).toBe(12)
  })

  it('does not disturb a completion already recorded', async () => {
    await setCompleted(client, account, 'flagship', 'lesson-1', true)
    await setPosition(client, account, 'flagship', 'lesson-1', 99)
    const progress = await courseProgress(client, account, 'flagship')
    expect(progress.get('lesson-1')).toMatchObject({ completed: true, position: 99 })
  })
})

describe('how far through the course somebody is', () => {
  const lessons = ['a', 'b', 'c', 'd']

  it('is nothing at the start', async () => {
    expect(percentComplete(await courseProgress(client, account, 'flagship'), lessons)).toBe(0)
  })

  it('counts only finished lessons', async () => {
    await setCompleted(client, account, 'flagship', 'a', true)
    await setPosition(client, account, 'flagship', 'b', 120)
    expect(percentComplete(await courseProgress(client, account, 'flagship'), lessons)).toBe(25)
  })

  it('does not divide by zero on an empty course', () => {
    expect(percentComplete(new Map(), [])).toBe(0)
  })

  it('ignores progress for lessons that are no longer in the course', async () => {
    await setCompleted(client, account, 'flagship', 'deleted-lesson', true)
    expect(percentComplete(await courseProgress(client, account, 'flagship'), lessons)).toBe(0)
  })
})

describe('where to pick up again', () => {
  const lessons = ['a', 'b', 'c']

  it('starts at the beginning for somebody new', async () => {
    expect(resumeLessonId(await courseProgress(client, account, 'flagship'), lessons)).toBe('a')
  })

  it('goes to the first unfinished lesson', async () => {
    await setCompleted(client, account, 'flagship', 'a', true)
    expect(resumeLessonId(await courseProgress(client, account, 'flagship'), lessons)).toBe('b')
  })

  it('skips over a finished lesson in the middle', async () => {
    await setCompleted(client, account, 'flagship', 'a', true)
    await setCompleted(client, account, 'flagship', 'b', true)
    expect(resumeLessonId(await courseProgress(client, account, 'flagship'), lessons)).toBe('c')
  })

  it('sends somebody who has finished back to the start', async () => {
    for (const id of lessons) await setCompleted(client, account, 'flagship', id, true)
    expect(resumeLessonId(await courseProgress(client, account, 'flagship'), lessons)).toBe('a')
  })
})
