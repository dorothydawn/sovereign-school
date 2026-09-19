import { describe, expect, it } from 'vitest'
import courseConfig from '../../course.config'

/**
 * These check the config a buyer edits by hand. A typo here is the most likely
 * way somebody breaks their own deployment, and the failure it would otherwise
 * cause — a student who paid seeing no course — is the worst one we have.
 */
describe('course.config.ts', () => {
  it('gives every course a unique id', () => {
    const ids = courseConfig.courses.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('maps every product onto courses that exist', () => {
    const known = new Set(courseConfig.courses.map((c) => c.id))
    for (const [productId, courseIds] of Object.entries(courseConfig.productToCourses)) {
      for (const courseId of courseIds) {
        expect(known, `product "${productId}" unlocks unknown course "${courseId}"`).toContain(courseId)
      }
    }
  })

  it('leaves at least one way for a student to sign in', () => {
    expect(courseConfig.auth.magicLink || courseConfig.auth.password).toBe(true)
  })

  it('has a site url with no trailing slash, since sign-in links are built from it', () => {
    expect(courseConfig.site.url).not.toMatch(/\/$/)
  })
})

describe('alerts', () => {
  it('warns before the ceiling, not at it', () => {
    for (const t of courseConfig.alerts.thresholds) {
      expect(t).toBeGreaterThan(0)
      expect(t).toBeLessThan(100)
    }
  })

  it('has at least one threshold if anything is being watched', () => {
    const watching =
      courseConfig.alerts.watchDatabaseUsage || courseConfig.alerts.watchEmailQuota
    if (watching) expect(courseConfig.alerts.thresholds.length).toBeGreaterThan(0)
  })
})

describe('comments', () => {
  it('cap how fast one account can post', () => {
    // Without a cap, one paid account can script enough comments to fill a
    // free database, and a full database stops sign-ins and purchases too.
    expect(courseConfig.comments.maxPerHour).toBeGreaterThan(0)
    expect(courseConfig.comments.maxPerHour).toBeLessThan(200)
  })

  it('ship on, and appear without waiting for approval', () => {
    // A queue only works if somebody watches it, and most owners will not.
    expect(courseConfig.comments.enabled).toBe(true)
    expect(courseConfig.comments.requireApproval).toBe(false)
  })
})
