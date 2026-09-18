import courseConfig from '../../../../course.config'

const EXPLANATIONS: Record<string, { heading: string; body: string }> = {
  'already-used': {
    heading: 'This link has already been used',
    body:
      'That usually means your access is set up and you are already signed in — ' +
      'try opening the course directly. If you are on a different device, sign in there.',
  },
  expired: {
    heading: 'This link has expired',
    body: 'Get in touch and we will send you a new one. Your purchase is safe.',
  },
  unknown: {
    heading: 'We do not recognise this link',
    body:
      'It may have been cut short when it was copied. Try opening it again from the ' +
      'original page or email, using the whole address.',
  },
}

/**
 * Shown when a claim link does not work.
 *
 * Every message here says the purchase is fine and gives a next step. Somebody
 * reading this page has paid and cannot get in, which is the worst moment this
 * product has — it is not the place to be terse.
 */
export default async function ClaimProblemPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const explanation = EXPLANATIONS[reason ?? 'unknown'] ?? EXPLANATIONS['unknown']

  return (
    <main style={{ maxWidth: '32rem', margin: '4rem auto', padding: '0 1rem' }}>
      <h1>{explanation?.heading}</h1>
      <p>{explanation?.body}</p>
      <p style={{ marginTop: '2rem' }}>
        <strong>Your purchase is not affected.</strong> If you are stuck, email{' '}
        <a href={`mailto:${courseConfig.site.supportEmail}`}>{courseConfig.site.supportEmail}</a>{' '}
        and we will sort it out.
      </p>
    </main>
  )
}
