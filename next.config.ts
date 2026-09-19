import type { NextConfig } from 'next'

/**
 * Response headers.
 *
 * Deliberately not a full Content-Security-Policy. A strict `script-src` needs
 * per-request nonces threaded through every page, and a strict `frame-src` would
 * break the `custom-embed` video host — whose whole point is that the owner can
 * use a provider we have never heard of. A policy that breaks the product is a
 * policy the buyer deletes, and then it protects nothing.
 *
 * So this sets the directives that are worth having on their own, cost nothing,
 * and cannot break a working deployment.
 */
const securityHeaders = [
  // Stop a response being reinterpreted as a type it is not.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Do not leak the full lesson URL to a video host in the Referer.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Nobody needs to frame a course platform, and being frameable is clickjacking.
  { key: 'X-Frame-Options', value: 'DENY' },

  {
    key: 'Content-Security-Policy',
    value: [
      // A form must not be able to post anywhere but here. If markup ever gets
      // injected, this stops it carrying a session somewhere else.
      "form-action 'self'",
      // Relative URLs cannot be repointed at another origin.
      "base-uri 'self'",
      // No Flash, no applets, nothing that predates the problem.
      "object-src 'none'",
      // The modern spelling of X-Frame-Options, for browsers that prefer it.
      "frame-ancestors 'none'",
    ].join('; '),
  },

  // The course does not need the camera, the microphone or the user's location.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The version of the framework is nobody else's business.
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
