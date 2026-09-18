import type { SqlClient } from '@/lib/db/runner'

export interface LessonProgress {
  lessonId: string
  completed: boolean
  /** Seconds into the video where they stopped. */
  position: number
}

/** All of an account's progress in one course, as a map keyed by lesson id. */
export async function courseProgress(
  db: SqlClient,
  accountId: string,
  courseId: string,
): Promise<Map<string, LessonProgress>> {
  const rows = await db.rows<{
    lesson_id: string
    completed_at: string | null
    video_position: number
  }>(
    `SELECT lesson_id, completed_at, video_position
       FROM progress WHERE account_id = $1 AND course_id = $2`,
    [accountId, courseId],
  )

  return new Map(
    rows.map((row) => [
      row.lesson_id,
      {
        lessonId: row.lesson_id,
        completed: row.completed_at !== null,
        position: row.video_position,
      },
    ]),
  )
}

/**
 * Marks a lesson done, or undoes it.
 *
 * Upserted rather than appended: one row per student per lesson, forever. A row
 * per view would grow without limit, and storage is the Neon free-tier limit
 * this product could actually blow.
 */
export async function setCompleted(
  db: SqlClient,
  accountId: string,
  courseId: string,
  lessonId: string,
  completed: boolean,
): Promise<void> {
  await db.rows(
    `INSERT INTO progress (account_id, course_id, lesson_id, completed_at)
     VALUES ($1, $2, $3, CASE WHEN $4 THEN now() ELSE NULL END)
     ON CONFLICT (account_id, course_id, lesson_id) DO UPDATE
       SET completed_at = CASE WHEN $4 THEN COALESCE(progress.completed_at, now()) ELSE NULL END,
           updated_at = now()`,
    [accountId, courseId, lessonId, completed],
  )
}

/**
 * Remembers where somebody stopped watching.
 *
 * Called on pause and on leaving the page, never on a timer. At five thousand
 * students a thirty-second timer is millions of writes for a convenience.
 */
export async function setPosition(
  db: SqlClient,
  accountId: string,
  courseId: string,
  lessonId: string,
  seconds: number,
): Promise<void> {
  // Guard the value here rather than trusting the browser: this arrives from a
  // page the student can edit.
  const position = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0

  await db.rows(
    `INSERT INTO progress (account_id, course_id, lesson_id, video_position)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id, course_id, lesson_id) DO UPDATE
       SET video_position = EXCLUDED.video_position, updated_at = now()`,
    [accountId, courseId, lessonId, position],
  )
}

/** How far through a course somebody is, as a whole percentage. */
export function percentComplete(progress: Map<string, LessonProgress>, lessonIds: string[]): number {
  if (lessonIds.length === 0) return 0
  const done = lessonIds.filter((id) => progress.get(id)?.completed).length
  return Math.round((done / lessonIds.length) * 100)
}

/** Where to send somebody who opens the course: the first thing unfinished. */
export function resumeLessonId(
  progress: Map<string, LessonProgress>,
  lessonIds: string[],
): string | undefined {
  return lessonIds.find((id) => !progress.get(id)?.completed) ?? lessonIds[0]
}
