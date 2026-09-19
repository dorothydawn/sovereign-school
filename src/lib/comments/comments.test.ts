import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { isOwner } from '@/lib/auth/owner'
import {
  MAX_COMMENT_LENGTH,
  commentSettings,
  countPending,
  deleteOwnComment,
  lessonComments,
  moderateComment,
  pendingComments,
  postComment,
} from './comments'

let db: PGlite
let client: SqlClient
let student: string
let other: string

const config = (over: Partial<CourseConfig['comments']> = {}, courseOver = {}) =>
  ({
    comments: { enabled: true, requireApproval: true, allowReplies: true, ...over },
    courses: [
      {
        id: 'flagship',
        title: 'F',
        description: '',
        contentDir: 'f',
        videoHost: 'youtube',
        ...courseOver,
      },
    ],
  }) as unknown as CourseConfig

beforeEach(async () => {
  db = new PGlite()
  client = pgliteClient(db)
  await runMigrations(client, join(process.cwd(), 'migrations'))
  const a = await client.rows<{ id: string }>(
    `INSERT INTO accounts (email) VALUES ('student@b.com') RETURNING id`,
  )
  const b = await client.rows<{ id: string }>(
    `INSERT INTO accounts (email) VALUES ('other@b.com') RETURNING id`,
  )
  student = a[0]!.id
  other = b[0]!.id
})
afterEach(async () => {
  await db.close()
  delete process.env['OWNER_EMAIL']
})

const post = (body: string, accountId = student, parentId?: string) =>
  postComment(client, config(), {
    accountId,
    courseId: 'flagship',
    lessonId: 'welcome',
    body,
    ...(parentId ? { parentId } : {}),
  })

describe('posting a comment', () => {
  it('waits for approval by default', async () => {
    const result = await post('This lesson was great')
    expect(result).toMatchObject({ ok: true, state: 'pending' })
  })

  it('publishes straight away when the owner has switched approval off', async () => {
    const result = await postComment(client, config({ requireApproval: false }), {
      accountId: student,
      courseId: 'flagship',
      lessonId: 'welcome',
      body: 'Straight up',
    })
    expect(result).toMatchObject({ ok: true, state: 'published' })
  })

  it('refuses an empty comment', async () => {
    expect(await post('   ')).toMatchObject({ ok: false })
  })

  it('refuses one longer than the limit', async () => {
    expect(await post('x'.repeat(MAX_COMMENT_LENGTH + 1))).toMatchObject({ ok: false })
  })

  it('refuses when comments are switched off', async () => {
    const result = await postComment(client, config({ enabled: false }), {
      accountId: student,
      courseId: 'flagship',
      lessonId: 'welcome',
      body: 'Hello',
    })
    expect(result).toMatchObject({ ok: false })
  })

  it('stores the text exactly, without interpreting it', async () => {
    // Comments are rendered as text, never as HTML. Storing them verbatim and
    // escaping at render is the only version of this that stays safe.
    const nasty = '<script>alert(1)</script> & "quotes"'
    await post(nasty)
    const rows = await client.rows<{ body: string }>(`SELECT body FROM comments`)
    expect(rows[0]?.body).toBe(nasty)
  })
})

describe('replies', () => {
  it('attaches to the comment above', async () => {
    const parent = await post('A question')
    if (!parent.ok) throw new Error('setup failed')
    expect(await post('An answer', other, parent.id)).toMatchObject({ ok: true })
  })

  it('refuses a reply to a reply', async () => {
    const parent = await post('A question')
    if (!parent.ok) throw new Error('setup failed')
    const reply = await post('An answer', other, parent.id)
    if (!reply.ok) throw new Error('setup failed')

    // Deeper threads are a forum, which is deliberately a different product.
    expect(await post('A follow-up', student, reply.id)).toMatchObject({ ok: false })
  })

  it('refuses a reply pointed at a comment on another lesson', async () => {
    // Otherwise a comment could be smuggled onto a lesson it was not written for.
    const parent = await postComment(client, config(), {
      accountId: student,
      courseId: 'flagship',
      lessonId: 'a-different-lesson',
      body: 'Elsewhere',
    })
    if (!parent.ok) throw new Error('setup failed')
    expect(await post('Smuggled', other, parent.id)).toMatchObject({ ok: false })
  })

  it('refuses replies when the owner has switched them off', async () => {
    const parent = await post('A question')
    if (!parent.ok) throw new Error('setup failed')

    const result = await postComment(client, config({ allowReplies: false }), {
      accountId: other,
      courseId: 'flagship',
      lessonId: 'welcome',
      parentId: parent.id,
      body: 'An answer',
    })
    expect(result).toMatchObject({ ok: false })
  })
})

describe('who can see what', () => {
  const asStudent = () => ({ accountId: student, isOwner: false })
  const asOther = () => ({ accountId: other, isOwner: false })
  const asOwner = () => ({ accountId: other, isOwner: true })

  it('hides a pending comment from everybody else', async () => {
    await post('Waiting for approval')
    expect(await lessonComments(client, 'flagship', 'welcome', asOther())).toHaveLength(0)
  })

  it('shows a student their own comment while it waits', async () => {
    // Otherwise it looks like it vanished and they post it again.
    await post('Waiting for approval')
    const mine = await lessonComments(client, 'flagship', 'welcome', asStudent())
    expect(mine).toHaveLength(1)
    expect(mine[0]?.state).toBe('pending')
  })

  it('shows the owner everything waiting', async () => {
    await post('Waiting for approval')
    expect(await lessonComments(client, 'flagship', 'welcome', asOwner())).toHaveLength(1)
  })

  it('shows a published comment to everyone', async () => {
    const posted = await post('Approved soon')
    if (!posted.ok) throw new Error('setup failed')
    await moderateComment(client, posted.id, 'publish')
    expect(await lessonComments(client, 'flagship', 'welcome', asOther())).toHaveLength(1)
  })

  it('hides a removed comment from everyone, including the owner', async () => {
    const posted = await post('Something unpleasant')
    if (!posted.ok) throw new Error('setup failed')
    await moderateComment(client, posted.id, 'remove')

    expect(await lessonComments(client, 'flagship', 'welcome', asOwner())).toHaveLength(0)
    expect(await lessonComments(client, 'flagship', 'welcome', asStudent())).toHaveLength(0)
  })

  it('keeps comments to their own lesson', async () => {
    const posted = await post('On welcome')
    if (!posted.ok) throw new Error('setup failed')
    await moderateComment(client, posted.id, 'publish')
    expect(await lessonComments(client, 'flagship', 'lesson-two', asOther())).toHaveLength(0)
  })
})

describe('the moderation queue', () => {
  it('counts what is waiting', async () => {
    await post('One')
    await post('Two', other)
    expect(await countPending(client)).toBe(2)
  })

  it('empties as things are approved', async () => {
    const posted = await post('One')
    if (!posted.ok) throw new Error('setup failed')
    await moderateComment(client, posted.id, 'publish')
    expect(await countPending(client)).toBe(0)
    expect(await pendingComments(client)).toHaveLength(0)
  })

  it('carries the author so the owner knows who wrote it', async () => {
    await post('One')
    expect((await pendingComments(client))[0]?.authorEmail).toBe('student@b.com')
  })
})

describe('a student withdrawing their own comment', () => {
  it('works on their own', async () => {
    const posted = await post('Actually, never mind')
    if (!posted.ok) throw new Error('setup failed')
    expect(await deleteOwnComment(client, student, posted.id)).toBe(true)
  })

  it('does nothing to somebody else', async () => {
    const posted = await post('Not yours to delete')
    if (!posted.ok) throw new Error('setup failed')
    expect(await deleteOwnComment(client, other, posted.id)).toBe(false)
  })
})

describe('per-course settings', () => {
  it('let one course override the site default', async () => {
    const settings = commentSettings(
      config({}, { comments: { enabled: false } }),
      'flagship',
    )
    expect(settings.enabled).toBe(false)
    expect(settings.allowReplies).toBe(true)
  })

  it('fall back to the site default for a course that says nothing', () => {
    expect(commentSettings(config(), 'flagship').requireApproval).toBe(true)
  })
})

describe('who the owner is', () => {
  it('is nobody when OWNER_EMAIL is unset', async () => {
    // Fails closed: the alternative is a moderation queue open to whoever finds it.
    expect(await isOwner(client, student)).toBe(false)
  })

  it('is the account matching OWNER_EMAIL', async () => {
    process.env['OWNER_EMAIL'] = 'student@b.com'
    expect(await isOwner(client, student)).toBe(true)
    expect(await isOwner(client, other)).toBe(false)
  })

  it('ignores capitals in OWNER_EMAIL', async () => {
    process.env['OWNER_EMAIL'] = '  Student@B.com '
    expect(await isOwner(client, student)).toBe(true)
  })
})
