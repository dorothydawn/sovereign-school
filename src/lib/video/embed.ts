import { createHash, createSign } from 'node:crypto'
import type { LessonVideo, VideoEmbed } from './types'

const ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen'

/** Seconds a signed playback URL stays valid. Long enough for a long lesson. */
const SIGNED_URL_TTL = 60 * 60 * 4

/**
 * Turns a lesson's video reference into something an iframe can show.
 *
 * Every host is equally supported. Where a host can restrict playback to the
 * owner's own site, this signs the URL or says why it could not; where a host
 * cannot, `protected` is false and the owner has already been told what that
 * means in docs/choosing-a-video-host.md.
 */
export function videoEmbed(video: LessonVideo, now = Date.now()): VideoEmbed {
  const env = process.env

  switch (video.host) {
    case 'youtube':
      // youtube-nocookie so a student is not tracked for watching a lesson they
      // paid for. Unlisted is not private: anyone with this URL can watch.
      return {
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.ref)}?rel=0&modestbranding=1`,
        allow: ALLOW,
        protected: false,
      }

    case 'vimeo': {
      // A Vimeo id may carry a privacy hash, written as `123456789/abcdef`.
      const [id, hash] = video.ref.split('/')
      const query = hash ? `?h=${encodeURIComponent(hash)}&dnt=1` : '?dnt=1'
      return {
        src: `https://player.vimeo.com/video/${encodeURIComponent(id ?? '')}${query}`,
        allow: ALLOW,
        // True only if the owner switched on domain-level privacy, which this
        // code cannot see. The setup docs make it a step rather than a hope.
        protected: true,
      }
    }

    case 'loom':
      return {
        src: `https://www.loom.com/embed/${encodeURIComponent(video.ref)}`,
        allow: ALLOW,
        protected: false,
      }

    case 'bunny': {
      const library = env['BUNNY_LIBRARY_ID']
      if (!library) {
        return { ...blank(), problem: 'BUNNY_LIBRARY_ID is not set. See docs/setup.md.' }
      }
      const key = env['BUNNY_TOKEN_KEY']
      if (!key) {
        // Playable but shareable. Say so rather than pretending it is locked.
        return {
          src: `https://iframe.mediadelivery.net/embed/${library}/${encodeURIComponent(video.ref)}`,
          allow: ALLOW,
          protected: false,
        }
      }
      const expires = Math.floor(now / 1000) + SIGNED_URL_TTL
      const token = createHash('sha256').update(`${key}${video.ref}${expires}`).digest('hex')
      return {
        src:
          `https://iframe.mediadelivery.net/embed/${library}/${encodeURIComponent(video.ref)}` +
          `?token=${token}&expires=${expires}`,
        allow: ALLOW,
        protected: true,
      }
    }

    case 'mux': {
      const keyId = env['MUX_SIGNING_KEY_ID']
      const privateKey = env['MUX_SIGNING_PRIVATE_KEY']

      if (!keyId || !privateKey) {
        return {
          src: `https://player.mux.com/${encodeURIComponent(video.ref)}`,
          allow: ALLOW,
          protected: false,
        }
      }

      const token = muxToken(video.ref, keyId, privateKey, now)
      if (!token) {
        return {
          ...blank(),
          problem:
            'MUX_SIGNING_PRIVATE_KEY could not be used to sign playback. It should be ' +
            'the base64 private key Mux gave you, or that key in PEM form.',
        }
      }
      return {
        src: `https://player.mux.com/${encodeURIComponent(video.ref)}?token=${token}`,
        allow: ALLOW,
        protected: true,
      }
    }

    case 'cloudflare-stream': {
      const code = env['CLOUDFLARE_STREAM_CUSTOMER_CODE']
      if (!code) {
        return {
          ...blank(),
          problem: 'CLOUDFLARE_STREAM_CUSTOMER_CODE is not set. See docs/setup.md.',
        }
      }
      // A signed ref is a token Cloudflare issued; an unsigned one is a video id.
      return {
        src: `https://customer-${code}.cloudflarestream.com/${encodeURIComponent(video.ref)}/iframe`,
        allow: ALLOW,
        protected: video.ref.includes('.'),
      }
    }

    case 'custom-embed': {
      if (!/^https:\/\//.test(video.ref)) {
        // An http:// or javascript: URL in an iframe is somebody else's code
        // running on the student's session.
        return { ...blank(), problem: 'A custom embed must be a full https:// URL.' }
      }
      return { src: video.ref, allow: ALLOW, protected: false }
    }
  }
}

function blank(): VideoEmbed {
  return { src: '', allow: ALLOW, protected: false }
}

/** Mux signed playback: a short RS256 JWT, built with node's crypto. */
function muxToken(
  playbackId: string,
  keyId: string,
  privateKey: string,
  now: number,
): string | null {
  try {
    const pem = privateKey.includes('BEGIN')
      ? privateKey
      : Buffer.from(privateKey, 'base64').toString('utf8')

    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId }))
    const payload = base64url(
      JSON.stringify({
        sub: playbackId,
        aud: 'v', // 'v' is Mux's audience for video playback.
        exp: Math.floor(now / 1000) + SIGNED_URL_TTL,
        kid: keyId,
      }),
    )

    const signer = createSign('RSA-SHA256')
    signer.update(`${header}.${payload}`)
    const signature = signer.sign(pem).toString('base64url')

    return `${header}.${payload}.${signature}`
  } catch {
    return null
  }
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}
