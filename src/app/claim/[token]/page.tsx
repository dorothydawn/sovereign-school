import courseConfig from '../../../../course.config'

/**
 * The page a student lands on after buying.
 *
 * It deliberately does NOT claim the token. Opening this page must be safe to
 * do repeatedly, because plenty of things open a link without a person
 * deciding to: corporate mail scanners follow every URL in an email, browsers
 * prefetch, chat apps fetch previews. A single-use token consumed by a GET is
 * a token burned before the student ever clicks, and they are locked out of
 * something they paid for.
 *
 * So the claim happens on a POST, from the button below.
 */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  return (
    <main style={{ maxWidth: '32rem', margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Thank you — your course is ready</h1>
      <p>Select the button below to set up your access to {courseConfig.site.name}.</p>

      <form method="post" action="/api/claim">
        <input type="hidden" name="token" value={token} />
        <button type="submit">Get into my course</button>
      </form>

      <p style={{ marginTop: '2rem', fontSize: '0.875rem' }}>
        Having trouble? Email{' '}
        <a href={`mailto:${courseConfig.site.supportEmail}`}>{courseConfig.site.supportEmail}</a>{' '}
        and include this page&rsquo;s address.
      </p>
    </main>
  )
}
