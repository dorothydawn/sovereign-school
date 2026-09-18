import courseConfig from '../../../../../course.config'

/**
 * Confirms a sign-in link before spending it.
 *
 * Like the claim page, this does NOT sign anybody in. Mail scanners and link
 * previews open every URL in an email; a one-time link spent by a GET is gone
 * before the student clicks it.
 */
export default async function SignInLinkPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <main style={{ maxWidth: '26rem', margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Sign in to {courseConfig.site.name}</h1>
      <p>Select the button below to finish signing in.</p>

      <form method="post" action="/api/auth/link">
        <input type="hidden" name="token" value={token} />
        <button type="submit">Sign me in</button>
      </form>
    </main>
  )
}
