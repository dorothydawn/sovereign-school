'use client'

import { useEffect, useRef } from 'react'
import type { VideoEmbed } from '@/lib/video/types'

interface Props {
  embed: VideoEmbed
  title: string
  courseId: string
  lessonId: string
  startAt: number
  remember: boolean
}

/**
 * The video, plus remembering where the student got to.
 *
 * Position is saved when the page is hidden or closed, not on a timer. A
 * thirty-second timer across a few thousand students is millions of writes for
 * a convenience, and the Neon free tier is what pays for it.
 *
 * Every host here is an iframe from another origin, so the page cannot read
 * playback time directly. Instead it measures how long the lesson has been open
 * and visible, which is close enough to be useful and costs nothing.
 */
export function LessonPlayer({ embed, title, courseId, lessonId, startAt, remember }: Props) {
  const watchedRef = useRef(startAt)
  const lastTickRef = useRef<number | null>(null)

  useEffect(() => {
    if (!remember) return

    const accrue = () => {
      if (lastTickRef.current !== null) {
        watchedRef.current += (Date.now() - lastTickRef.current) / 1000
        lastTickRef.current = null
      }
    }

    const save = () => {
      accrue()
      const body = JSON.stringify({
        courseId,
        lessonId,
        position: Math.round(watchedRef.current),
      })
      // sendBeacon survives the page going away, which a fetch usually does not.
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/progress', new Blob([body], { type: 'application/json' }))
      } else {
        void fetch('/api/progress', {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        })
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save()
      else lastTickRef.current = Date.now()
    }

    lastTickRef.current = Date.now()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', save)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', save)
      save()
    }
  }, [courseId, lessonId, remember])

  if (embed.problem) {
    return (
      <p className="notice">
        <strong>This video cannot be shown yet.</strong> {embed.problem}
      </p>
    )
  }

  return (
    <div className="video-frame">
      <iframe
        src={embed.src}
        title={title}
        allow={embed.allow}
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}
