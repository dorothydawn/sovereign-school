import courseConfig from '../../../course.config'

const PROBLEMS: Record<string, string> = {
  invalid: 'That email address and password did not match. Please try again.',
  'rate-limited':
    'Too many attempts. For safety this pauses for a few minutes — please wait and try again.',
  link: 'That sign-in link has expired or has already been used. Request a new one below.',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; problem?: string }>
}) {
  const { sent, problem } = await searchParams
  const message = problem ? PROBLEMS[problem] : undefined

  return (
    <main style={{ maxWidth: '26rem', margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Sign in to {courseConfig.site.name}</h1>

      {message && <p role="alert">{message}</p>}

      {sent && (
        // Deliberately not "we sent you an email": that would confirm whether
        // the address has an account to anybody who types one in.
        <p role="status">
          If that address has an account, a sign-in link is on its way. It works once
          and expires in 30 minutes.
        </p>
      )}

      {courseConfig.auth.magicLink && (
        <form method="post" action="/api/auth/request-link">
          <h2>Email me a link</h2>
          <label htmlFor="link-email">Your email address</label>
          <input id="link-email" name="email" type="email" required autoComplete="email" />
          <button type="submit">Send me a sign-in link</button>
        </form>
      )}

      {courseConfig.auth.password && (
        <form method="post" action="/api/auth/signin" style={{ marginTop: '2rem' }}>
          <h2>Or use your password</h2>
          <label htmlFor="email">Your email address</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          <button type="submit">Sign in</button>
        </form>
      )}

      <p style={{ marginTop: '2rem', fontSize: '0.875rem' }}>
        Bought a course but never set up access? Use the link from your receipt. Stuck?
        Email <a href={`mailto:${courseConfig.site.supportEmail}`}>{courseConfig.site.supportEmail}</a>.
      </p>
    </main>
  )
}
