import type { VideoHost } from '@/config/types'

/**
 * What a lesson says about its video.
 *
 * `ref` means whatever the chosen host calls its identifier: a YouTube video id,
 * a Vimeo id, a Bunny guid, a Mux playback id, or for `custom-embed` the whole
 * embed URL.
 */
export interface LessonVideo {
  host: VideoHost
  ref: string
}

export interface VideoEmbed {
  /** The URL to put in an iframe. */
  src: string
  /** What the iframe is allowed to do. Fullscreen and picture-in-picture at least. */
  allow: string
  /** Whether the host can stop this URL working on somebody else's site. */
  protected: boolean
  /** Set when the host is misconfigured, so the page can say so rather than showing a blank box. */
  problem?: string
}
