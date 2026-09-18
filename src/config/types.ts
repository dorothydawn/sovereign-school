/**
 * Types for `course.config.ts`.
 *
 * You should not need to edit this file. It exists so that your editor and your
 * coding agent can tell you when something in `course.config.ts` is wrong,
 * before you deploy rather than after.
 */

/**
 * Where your lesson videos are hosted.
 *
 * Every option here is fully supported. There is no "recommended" one, because
 * the right answer depends on how many students you expect and how much you
 * care about people sharing your videos. See `docs/choosing-a-video-host.md`
 * for what each one costs at your size and what it protects you from.
 */
export type VideoHost =
  | 'youtube'
  | 'vimeo'
  | 'loom'
  | 'bunny'
  | 'mux'
  | 'cloudflare-stream'
  /** Any other host that gives you an embeddable URL. You supply the URL per lesson. */
  | 'custom-embed'

/**
 * How a student proves who they are.
 *
 * Both can be switched on at once, and most courses should. Magic links are
 * less to go wrong; passwords are the fallback for students who bought without
 * giving an email address, and for anyone whose email is slow or filtered.
 */
export interface AuthConfig {
  /** Email a one-time sign-in link. Requires email delivery to be configured. */
  magicLink: boolean
  /** Let students set a password. The only way in for students with no email on file. */
  password: boolean
}

export interface CommentsConfig {
  /**
   * Turn comments on or off for the whole site. Individual courses and lessons
   * can still override this.
   */
  enabled: boolean
  /**
   * When true, a comment is hidden until you approve it in the owner dashboard.
   * When false, comments appear immediately and you moderate after the fact.
   */
  requireApproval: boolean
  /** Let students reply to each other, not just post top-level comments. */
  allowReplies: boolean
}

export interface ProgressConfig {
  /** Show a completion tick per lesson and a percentage for the course. */
  trackCompletion: boolean
  /** Remember where a student stopped watching and offer to resume. */
  rememberVideoPosition: boolean
}

export interface CourseDefinition {
  /** Stable identifier. Used in URLs and in the funnel's product mapping. Do not change it later. */
  id: string
  title: string
  description: string
  /** Folder under `content/` holding this course's lesson files. */
  contentDir: string
  /** Which video host this course's lessons use. Courses may differ. */
  videoHost: VideoHost
  /** Override the site-wide comments setting for this course. */
  comments?: Partial<CommentsConfig>
}

export interface CourseConfig {
  site: {
    name: string
    /** Shown in the browser tab and in emails. */
    tagline: string
    /** The address students see emails come from. */
    supportEmail: string
    /** Your deployed URL, no trailing slash. Used to build sign-in links. */
    url: string
  }
  auth: AuthConfig
  comments: CommentsConfig
  progress: ProgressConfig
  courses: CourseDefinition[]
  /**
   * Maps a product id from your funnel onto the course(s) it unlocks.
   *
   * The funnel sends `productIds` when somebody buys. Anything not listed here
   * is still recorded and the customer is still enrolled, but they will not see
   * a course until you add the mapping — so keep this in step with your funnel.
   */
  productToCourses: Record<string, string[]>
  access: {
    /**
     * Whether a refund takes a student's access away.
     *
     * Leave this `false` if you have not decided. The platform always records
     * refunds either way, so you can switch this on later without losing
     * anything or needing a database change.
     */
    refundRevokesAccess: boolean
    /**
     * Whether a partial refund also revokes. Usually a partial refund is a
     * discount after the fact rather than a withdrawal, so this defaults off.
     */
    partialRefundRevokesAccess: boolean
  }
}
