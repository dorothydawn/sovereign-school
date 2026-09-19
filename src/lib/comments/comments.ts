import type { SqlClient } from '@/lib/db/runner'
import type { CommentsConfig, CourseConfig } from '@/config/types'

export interface Comment {
  id: string
  accountId: string
  courseId: string
  lessonId: string
  parentId: string | null
  /**
   * Exactly what the student typed. Never HTML, and never rendered as HTML:
   * this is the one thing on a lesson page that a stranger controls.
   */
  body: string
  state: 'pending' | 'published' | 'removed'
  createdAt: string
  authorEmail: string | null
}

export const MAX_COMMENT_LENGTH = 4000

/** Settings for one course, falling back to the site-wide ones. */
export function commentSettings(config: CourseConfig, courseId: string): CommentsConfig {
  const course = config.courses.find((c) => c.id === courseId)
  return { ...config.comments, ...(course?.comments ?? {}) }
}

/**
 * Stops one account flooding the comments.
 *
 * A comment can be 4,000 characters and a free Neon database is 500 MB, so
 * roughly 125,000 comments fills it — and a full database stops accepting
 * sign-ins and purchases, not just comments. The cost of doing that is one
 * course purchase, which is not much of a deterrent.
 *
 * Counted straight from the comments table, including removed ones: deleting
 * spam must not hand the spammer a fresh allowance, and it saves a table whose
 * only job would be counting.
 */
async function rateLimit(
  db: SqlClient,
  accountId: string,
  maxPerHour: number,
): Promise<{ ok: false; reason: string } | null> {
  if (!Number.isFinite(maxPerHour) || maxPerHour <= 0) return null

  const rows = await db.rows<{ c: number }>(
    `SELECT count(*)::int AS c FROM comments
      WHERE account_id = $1 AND created_at > now() - interval '1 hour'`,
    [accountId],
  )

  if ((rows[0]?.c ?? 0) < maxPerHour) return null

  return {
    ok: false,
    reason: 'That is a lot of comments in a short time. Please wait a little and try again.',
  }
}

export type PostResult =
  | { ok: true; id: string; state: 'pending' | 'published' }
  | { ok: false; reason: string }

export async function postComment(
  db: SqlClient,
  config: CourseConfig,
  input: {
    accountId: string
    courseId: string
    lessonId: string
    parentId?: string | null
    body: string
    /** The owner is never rate-limited on their own site. */
    isOwner?: boolean
  },
): Promise<PostResult> {
  const settings = commentSettings(config, input.courseId)
  if (!settings.enabled) return { ok: false, reason: 'Comments are switched off.' }

  if (!input.isOwner) {
    const limit = await rateLimit(db, input.accountId, settings.maxPerHour)
    if (limit) return limit
  }

  const body = input.body.trim()
  if (body.length === 0) return { ok: false, reason: 'Write something first.' }
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, reason: `Comments are limited to ${MAX_COMMENT_LENGTH} characters.` }
  }

  if (input.parentId) {
    if (!settings.allowReplies) return { ok: false, reason: 'Replies are switched off.' }

    // A reply must belong to the same lesson, or a comment could be smuggled
    // onto one lesson by replying to a comment from another.
    const parent = await db.rows<{
      course_id: string
      lesson_id: string
      parent_id: string | null
    }>(`SELECT course_id, lesson_id, parent_id FROM comments WHERE id = $1`, [input.parentId])

    const found = parent[0]
    if (!found || found.course_id !== input.courseId || found.lesson_id !== input.lessonId) {
      return { ok: false, reason: 'That comment is no longer here.' }
    }
    // One level only. Deeper threads are a forum, which is a different product.
    if (found.parent_id) return { ok: false, reason: 'You cannot reply to a reply.' }
  }

  const state = settings.requireApproval ? 'pending' : 'published'

  const rows = await db.rows<{ id: string }>(
    `INSERT INTO comments (account_id, course_id, lesson_id, parent_id, body, state)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.accountId, input.courseId, input.lessonId, input.parentId ?? null, body, state],
  )

  const id = rows[0]?.id
  if (!id) return { ok: false, reason: 'That did not save. Please try again.' }

  return { ok: true, id, state }
}

interface CommentRow {
  id: string
  account_id: string
  course_id: string
  lesson_id: string
  parent_id: string | null
  body: string
  state: Comment['state']
  created_at: string
  author_email: string | null
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    accountId: row.account_id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    parentId: row.parent_id,
    body: row.body,
    state: row.state,
    createdAt: row.created_at,
    authorEmail: row.author_email,
  }
}

const SELECT_COMMENT = `
  SELECT c.id, c.account_id, c.course_id, c.lesson_id, c.parent_id, c.body,
         c.state, c.created_at, a.email AS author_email
    FROM comments c
    JOIN accounts a ON a.id = c.account_id`

/**
 * Comments to show under a lesson.
 *
 * A student sees published ones, plus their own still awaiting approval so they
 * can tell it went somewhere. The owner sees everything not removed.
 */
export async function lessonComments(
  db: SqlClient,
  courseId: string,
  lessonId: string,
  viewer: { accountId: string; isOwner: boolean },
): Promise<Comment[]> {
  const rows = await db.rows<CommentRow>(
    `${SELECT_COMMENT}
      WHERE c.course_id = $1 AND c.lesson_id = $2
        AND (
          c.state = 'published'
          OR ($3 AND c.state <> 'removed')
          OR (c.state = 'pending' AND c.account_id = $4)
        )
      ORDER BY c.created_at`,
    [courseId, lessonId, viewer.isOwner, viewer.accountId],
  )
  return rows.map(toComment)
}

/** Everything waiting for the owner, oldest first. */
export async function pendingComments(db: SqlClient, limit = 100): Promise<Comment[]> {
  const rows = await db.rows<CommentRow>(
    `${SELECT_COMMENT} WHERE c.state = 'pending' ORDER BY c.created_at LIMIT $1`,
    [limit],
  )
  return rows.map(toComment)
}

export async function countPending(db: SqlClient): Promise<number> {
  const rows = await db.rows<{ c: number }>(
    `SELECT count(*)::int AS c FROM comments WHERE state = 'pending'`,
  )
  return rows[0]?.c ?? 0
}

/** Approve or remove. Only called once the caller is confirmed as the owner. */
export async function moderateComment(
  db: SqlClient,
  commentId: string,
  action: 'publish' | 'remove',
): Promise<boolean> {
  const rows = await db.rows<{ id: string }>(
    `UPDATE comments SET state = $2, updated_at = now() WHERE id = $1 RETURNING id`,
    [commentId, action === 'publish' ? 'published' : 'removed'],
  )
  return rows.length > 0
}

/** A student withdrawing their own comment. */
export async function deleteOwnComment(
  db: SqlClient,
  accountId: string,
  commentId: string,
): Promise<boolean> {
  const rows = await db.rows<{ id: string }>(
    `UPDATE comments SET state = 'removed', updated_at = now()
      WHERE id = $1 AND account_id = $2 RETURNING id`,
    [commentId, accountId],
  )
  return rows.length > 0
}
