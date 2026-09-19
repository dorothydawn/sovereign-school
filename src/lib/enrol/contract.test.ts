import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The parts of the funnel contract that are the same for every deployment.
 *
 * A buyer chooses their platform URL, their product ids and their shared
 * secret. They do not choose the path, the header name or the variable name —
 * those are fixed by this template, which is exactly what lets the funnel
 * template build a working call from a base URL alone.
 *
 * These assertions read the source rather than call the code, because the point
 * is not that the handler works: it is that these three strings cannot change
 * without somebody being made to think about every funnel already pointed here.
 */
const ENROL_ROUTE = join(process.cwd(), 'src/app/api/enrol/route.ts')

describe('what every deployment has in common', () => {
  it('serves enrolment at /api/enrol', () => {
    // The funnel builds this from COURSE_PLATFORM_URL + this path.
    expect(existsSync(ENROL_ROUTE)).toBe(true)
  })

  it('reads the signature from X-Funnel-Signature', () => {
    const source = readFileSync(ENROL_ROUTE, 'utf8')
    expect(source).toContain("'x-funnel-signature'")
  })

  it('names the shared secret FUNNEL_SHARED_SECRET', () => {
    const source = readFileSync(ENROL_ROUTE, 'utf8')
    expect(source).toContain("FUNNEL_SHARED_SECRET")
  })

  it('offers the handshake at /api/enrol/check', () => {
    expect(existsSync(join(process.cwd(), 'src/app/api/enrol/check/route.ts'))).toBe(true)
  })

  it('documents every environment variable the code reads', () => {
    // A variable that exists only in the code is one the buyer will never set.
    const setup = readFileSync(join(process.cwd(), 'docs/setup.md'), 'utf8')
    const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8')

    const used = new Set<string>()
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          if (entry.name.includes('.test.')) continue
          for (const m of readFileSync(path, 'utf8').matchAll(/process\.env\[?['"]?([A-Z_]{4,})/g)) {
            if (m[1] && m[1] !== 'NODE_ENV') used.add(m[1])
          }
        }
      }
    }
    walk(join(process.cwd(), 'src'))

    const undocumented = [...used].filter((name) => !setup.includes(name))
    const missingFromExample = [...used].filter((name) => !example.includes(name))

    expect(undocumented, 'not in docs/setup.md').toEqual([])
    expect(missingFromExample, 'not in .env.example').toEqual([])
  })
})
