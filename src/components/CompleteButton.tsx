'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  courseId: string
  lessonId: string
  completed: boolean
  nextHref: string | null
}

/**
 * Marks the lesson done and moves straight on.
 *
 * Going back to a contents page between lessons is the friction the research is
 * clearest about: every extra click is a chance to stop. So the primary action
 * both records progress and advances.
 */
export function CompleteButton({ courseId, lessonId, completed, nextHref }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function mark(done: boolean, advance: boolean) {
    setBusy(true)
    setFailed(false)
    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, lessonId, completed: done }),
      })
      if (!response.ok) throw new Error(String(response.status))

      if (advance && nextHref) router.push(nextHref)
      else router.refresh()
    } catch {
      // Silently losing a tick would have the student redo a lesson they
      // finished. Say it did not save.
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="lesson-actions">
        {completed ? (
          <>
            <button type="button" onClick={() => void mark(false, false)} disabled={busy}>
              Mark as not done
            </button>
            {nextHref && (
              <button type="button" className="primary" onClick={() => router.push(nextHref)}>
                Next lesson
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={() => void mark(true, true)}
            disabled={busy}
          >
            {nextHref ? 'Mark done and continue' : 'Mark this lesson done'}
          </button>
        )}
      </div>
      {failed && (
        <p role="alert" className="notice">
          That did not save. Check your connection and try again — you have not lost
          anything.
        </p>
      )}
    </>
  )
}
