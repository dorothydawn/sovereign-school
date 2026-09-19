/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THIS IS THE ONLY FILE YOU HAVE TO EDIT TO MAKE THIS PLATFORM YOURS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything specific to one course business lives here: the name, the courses,
 * where the videos are, whether comments are on. The code reads from this file
 * and never hardcodes any of it.
 *
 * You can hand this file to your coding agent and describe what you want in
 * plain English. Nothing here requires you to understand the rest of the repo.
 *
 * Secrets — database passwords, API keys — do NOT go in this file. They go in
 * environment variables, because this file is committed to your repository and
 * anyone you share the repo with can read it. See `docs/setup.md`.
 */

import type { CourseConfig } from '@/config/types'

export const courseConfig: CourseConfig = {
  site: {
    name: "Justin's School",
    tagline: 'Everything I know, in order.',
    supportEmail: 'hello@example.com',
    url: 'https://example.com',
  },

  /**
   * Both are on. Magic links are the everyday route; passwords exist because
   * a student can buy without giving an email address, and those students need
   * some way to get back in.
   */
  auth: {
    magicLink: true,
    password: true,
  },

  /**
   * Who sends your emails. Gmail is free and takes five minutes; it sends 100 a
   * day, which is fine until launch day. `docs/choosing-an-email-sender.md`
   * explains when that stops being enough and what it costs to fix (about $20).
   *
   * Credentials go in environment variables, never here.
   */
  email: {
    provider: 'gmail',
    from: 'hello@example.com',
  },

  /**
   * Free tiers can run out, and some providers switch off without telling you.
   * Neon's free plan suspends your database with no warning at all. The platform
   * watches instead, and emails you before you get there.
   *
   * Turning these off is not recommended. The first you would know is a student
   * telling you your course is broken.
   */
  alerts: {
    thresholds: [70, 90],
    watchDatabaseUsage: true,
    watchEmailQuota: true,
  },

  /**
   * Comments sit under each lesson. They are worth having on: students tell you
   * which lesson landed, and what they write is often the most honest
   * testimonial you will ever get.
   *
   * They appear straight away. A comment held back for checking usually stays
   * held back — most people do not watch a queue — and a conversation that only
   * happens once you approve it mostly does not happen.
   *
   * Set `requireApproval: true` if you would rather see everything first. You
   * can remove any comment at any time either way.
   */
  comments: {
    enabled: true,
    requireApproval: false,
    allowReplies: true,
  },

  progress: {
    trackCompletion: true,
    rememberVideoPosition: true,
  },

  /**
   * Your courses. Add as many as you like — students who buy more than one see
   * them all in the same place, under the same login.
   */
  courses: [
    {
      id: 'flagship',
      title: 'The Flagship Course',
      description: 'The main thing.',
      contentDir: 'flagship',
      videoHost: 'youtube',
    },
  ],

  /**
   * When somebody buys, your funnel sends the product id they bought. This says
   * which course that unlocks. The ids on the left must match your funnel; the
   * ids on the right must match `courses` above.
   */
  productToCourses: {
    'flagship-course': ['flagship'],
  },

  /**
   * Refunds. Left off deliberately — see `docs/decisions/refunds.md`. Refunds
   * are always recorded, so turning this on later changes behaviour immediately
   * and costs you nothing now.
   */
  access: {
    refundRevokesAccess: false,
    partialRefundRevokesAccess: false,
  },
}

export default courseConfig
