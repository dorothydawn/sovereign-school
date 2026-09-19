import type { Comment } from '@/lib/comments/comments'
import { MAX_COMMENT_LENGTH } from '@/lib/comments/comments'

interface Props {
  comments: Comment[]
  courseId: string
  lessonId: string
  accountId: string
  isOwner: boolean
  allowReplies: boolean
  notice?: 'pending' | 'problem' | undefined
}

/** A name to show. Full addresses are nobody else's business. */
function displayName(comment: Comment): string {
  if (!comment.authorEmail) return 'A student'
  const [local] = comment.authorEmail.split('@')
  return local ?? 'A student'
}

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Comments under a lesson.
 *
 * Every body here is rendered as text. React escapes it, and nothing on this
 * page passes a comment to dangerouslySetInnerHTML — the lesson body is the
 * owner's own Markdown, a comment is a stranger's typing, and the two must
 * never be treated alike.
 */
export function Comments({
  comments,
  courseId,
  lessonId,
  accountId,
  isOwner,
  allowReplies,
  notice,
}: Props) {
  const top = comments.filter((c) => !c.parentId)
  const repliesTo = (id: string) => comments.filter((c) => c.parentId === id)

  return (
    <section id="comments" className="comments">
      <h2>Comments</h2>

      {notice === 'pending' && (
        <p role="status" className="notice">
          Thank you — your comment has been sent to be checked, and will appear once
          it is approved.
        </p>
      )}
      {notice === 'problem' && (
        <p role="alert" className="notice">
          That comment could not be posted. It may have been empty or too long.
        </p>
      )}

      <form method="post" action="/api/comments" className="comment-form">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="lessonId" value={lessonId} />
        <label htmlFor="comment-body">Leave a comment</label>
        <textarea
          id="comment-body"
          name="body"
          rows={4}
          maxLength={MAX_COMMENT_LENGTH}
          required
          placeholder="What did you take from this lesson?"
        />
        <button type="submit" className="primary">
          Post comment
        </button>
      </form>

      {top.length === 0 ? (
        <p className="muted">No comments yet. Be the first.</p>
      ) : (
        <ol className="comment-list">
          {top.map((comment) => (
            <li key={comment.id}>
              <article className={comment.state === 'pending' ? 'comment pending' : 'comment'}>
                <header>
                  <strong>{displayName(comment)}</strong>{' '}
                  <span className="muted">{when(comment.createdAt)}</span>
                  {comment.state === 'pending' && (
                    <span className="badge">Waiting for approval</span>
                  )}
                </header>

                {/* Text, deliberately. Never HTML. */}
                <p className="comment-body">{comment.body}</p>

                <CommentActions
                  comment={comment}
                  accountId={accountId}
                  isOwner={isOwner}
                  courseId={courseId}
                  lessonId={lessonId}
                />

                {allowReplies && (
                  <details className="reply">
                    <summary>Reply</summary>
                    <form method="post" action="/api/comments">
                      <input type="hidden" name="courseId" value={courseId} />
                      <input type="hidden" name="lessonId" value={lessonId} />
                      <input type="hidden" name="parentId" value={comment.id} />
                      <label htmlFor={`reply-${comment.id}`} className="visually-hidden">
                        Your reply
                      </label>
                      <textarea
                        id={`reply-${comment.id}`}
                        name="body"
                        rows={3}
                        maxLength={MAX_COMMENT_LENGTH}
                        required
                      />
                      <button type="submit">Post reply</button>
                    </form>
                  </details>
                )}

                {repliesTo(comment.id).length > 0 && (
                  <ol className="comment-list replies">
                    {repliesTo(comment.id).map((reply) => (
                      <li key={reply.id}>
                        <article className={reply.state === 'pending' ? 'comment pending' : 'comment'}>
                          <header>
                            <strong>{displayName(reply)}</strong>{' '}
                            <span className="muted">{when(reply.createdAt)}</span>
                            {reply.state === 'pending' && (
                              <span className="badge">Waiting for approval</span>
                            )}
                          </header>
                          <p className="comment-body">{reply.body}</p>
                          <CommentActions
                            comment={reply}
                            accountId={accountId}
                            isOwner={isOwner}
                            courseId={courseId}
                            lessonId={lessonId}
                          />
                        </article>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function CommentActions({
  comment,
  accountId,
  isOwner,
  courseId,
  lessonId,
}: {
  comment: Comment
  accountId: string
  isOwner: boolean
  courseId: string
  lessonId: string
}) {
  const mine = comment.accountId === accountId

  return (
    <div className="comment-actions">
      {mine && (
        <form method="post" action="/api/comments">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="lessonId" value={lessonId} />
          <input type="hidden" name="withdraw" value={comment.id} />
          <button type="submit" className="link-button">
            Delete
          </button>
        </form>
      )}

      {isOwner && (
        <>
          {comment.state === 'pending' && (
            <form method="post" action="/api/comments/moderate">
              <input type="hidden" name="commentId" value={comment.id} />
              <input type="hidden" name="action" value="publish" />
              <input type="hidden" name="from" value={`/course/${courseId}/${lessonId}`} />
              <button type="submit" className="link-button">
                Approve
              </button>
            </form>
          )}
          <form method="post" action="/api/comments/moderate">
            <input type="hidden" name="commentId" value={comment.id} />
            <input type="hidden" name="action" value="remove" />
            <input type="hidden" name="from" value={`/course/${courseId}/${lessonId}`} />
            <button type="submit" className="link-button">
              Remove
            </button>
          </form>
        </>
      )}
    </div>
  )
}
