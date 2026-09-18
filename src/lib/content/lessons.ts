import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { marked } from 'marked'
import type { CourseConfig, CourseDefinition, VideoHost } from '@/config/types'
import { parseFrontMatter } from './frontmatter'

export interface Lesson {
  /** Taken from the filename, minus its ordering prefix. Used in URLs. */
  id: string
  title: string
  /** Undefined for a written-only lesson. Not every lesson needs a video. */
  video?: { host: VideoHost; ref: string }
  /** The lesson body, already rendered. */
  html: string
  /** Position in the course, from the filename prefix. */
  order: number
}

/** `01-getting-started.md` sorts first and has the id `getting-started`. */
const LESSON_FILE = /^(\d+)[-_](.+)\.md$/

export function contentRoot(): string {
  return join(process.cwd(), 'content')
}

/**
 * Reads a course's lessons from disk, in order.
 *
 * Content is files in the repository, edited by the owner or their agent. There
 * is no course builder and no database table of lessons: a lesson is a Markdown
 * file, which is the same thing the funnel kit does and the same pitch.
 */
export async function loadLessons(course: CourseDefinition): Promise<Lesson[]> {
  const dir = join(contentRoot(), course.contentDir)

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    // A course configured with no content directory yet is a normal state while
    // somebody is setting up, not a crash.
    return []
  }

  const lessons: Lesson[] = []

  for (const entry of entries.sort()) {
    const match = LESSON_FILE.exec(entry)
    if (!match) continue

    const [, orderRaw, idRaw] = match
    const source = await readFile(join(dir, entry), 'utf8')
    const { data, body } = parseFrontMatter(source)

    const ref = data['video']
    lessons.push({
      id: idRaw ?? entry,
      title: data['title'] ?? idRaw ?? entry,
      // A lesson may name its own host, so one course can mix a YouTube intro
      // with paid lessons somewhere private.
      ...(ref
        ? { video: { host: (data['videoHost'] as VideoHost) ?? course.videoHost, ref } }
        : {}),
      html: await marked.parse(body),
      order: Number(orderRaw ?? 0),
    })
  }

  return lessons.sort((a, b) => a.order - b.order)
}

export function findCourse(config: CourseConfig, courseId: string): CourseDefinition | undefined {
  return config.courses.find((course) => course.id === courseId)
}

/** The lesson after this one, for the "mark complete and continue" button. */
export function nextLesson(lessons: Lesson[], currentId: string): Lesson | undefined {
  const index = lessons.findIndex((lesson) => lesson.id === currentId)
  return index === -1 ? undefined : lessons[index + 1]
}
