/**
 * A deliberately small front-matter reader.
 *
 * Lesson files are written by the owner or their agent and look like this:
 *
 *     ---
 *     title: Getting started
 *     video: dQw4w9WgXcQ
 *     ---
 *     The lesson body, in Markdown.
 *
 * Only `key: value` pairs are supported. That is all a lesson needs, and a full
 * YAML parser is a dependency plus a surface area of syntax an owner can get
 * subtly wrong with no way to tell.
 */
export interface FrontMatter {
  data: Record<string, string>
  body: string
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontMatter(source: string): FrontMatter {
  const match = FENCE.exec(source)
  if (!match) return { data: {}, body: source.trim() }

  const data: Record<string, string> = {}

  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf(':')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()

    // Quotes are optional, so a title with a colon in it still works.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1)
    }

    if (key) data[key] = value
  }

  return { data, body: source.slice(match[0].length).trim() }
}
