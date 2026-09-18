import { describe, expect, it } from 'vitest'
import type { CourseDefinition } from '@/config/types'
import { parseFrontMatter } from './frontmatter'
import { loadLessons, nextLesson } from './lessons'

const course: CourseDefinition = {
  id: 'flagship',
  title: 'Flagship',
  description: '',
  contentDir: 'flagship',
  videoHost: 'youtube',
}

describe('front matter', () => {
  it('separates the settings from the body', () => {
    const { data, body } = parseFrontMatter('---\ntitle: Hello\nvideo: abc\n---\nThe body.')
    expect(data).toEqual({ title: 'Hello', video: 'abc' })
    expect(body).toBe('The body.')
  })

  it('copes with a file that has none', () => {
    expect(parseFrontMatter('Just a body.')).toEqual({ data: {}, body: 'Just a body.' })
  })

  it('keeps a colon inside a title', () => {
    const { data } = parseFrontMatter('---\ntitle: Part one: the beginning\n---\nx')
    expect(data['title']).toBe('Part one: the beginning')
  })

  it('strips optional quotes', () => {
    const { data } = parseFrontMatter('---\ntitle: "Quoted"\nvideo: \'abc\'\n---\nx')
    expect(data).toEqual({ title: 'Quoted', video: 'abc' })
  })

  it('handles Windows line endings, because owners edit these on Windows', () => {
    const { data, body } = parseFrontMatter('---\r\ntitle: Hello\r\n---\r\nBody.')
    expect(data['title']).toBe('Hello')
    expect(body).toBe('Body.')
  })

  it('ignores blank lines and comments', () => {
    const { data } = parseFrontMatter('---\n# a note\n\ntitle: Hello\n---\nx')
    expect(data).toEqual({ title: 'Hello' })
  })
})

describe('loading a course from disk', () => {
  it('reads the lessons that ship with the template', async () => {
    const lessons = await loadLessons(course)
    expect(lessons.length).toBeGreaterThanOrEqual(2)
    expect(lessons[0]?.title).toBe('Welcome, and how to use this')
  })

  it('orders them by the number in the filename', async () => {
    const lessons = await loadLessons(course)
    expect(lessons.map((l) => l.order)).toEqual([...lessons.map((l) => l.order)].sort((a, b) => a - b))
  })

  it('takes the id from the filename, without the ordering prefix', async () => {
    const lessons = await loadLessons(course)
    expect(lessons[0]?.id).toBe('welcome')
  })

  it('renders the body to HTML', async () => {
    const lessons = await loadLessons(course)
    expect(lessons[0]?.html).toContain('<h2')
  })

  it('uses the course video host when the lesson does not name one', async () => {
    const lessons = await loadLessons(course)
    expect(lessons[0]?.video?.host).toBe('youtube')
  })

  it('returns nothing rather than throwing when a course has no content yet', async () => {
    // Normal while somebody is setting up. Crashing would be unhelpful.
    const missing = { ...course, contentDir: 'not-created-yet' }
    expect(await loadLessons(missing)).toEqual([])
  })
})

describe('moving to the next lesson', () => {
  const lessons = [
    { id: 'a', title: 'A', html: '', order: 1 },
    { id: 'b', title: 'B', html: '', order: 2 },
  ]

  it('finds the one after', () => {
    expect(nextLesson(lessons, 'a')?.id).toBe('b')
  })

  it('returns nothing at the end of the course', () => {
    expect(nextLesson(lessons, 'b')).toBeUndefined()
  })

  it('returns nothing for a lesson that is not there', () => {
    expect(nextLesson(lessons, 'zzz')).toBeUndefined()
  })
})
