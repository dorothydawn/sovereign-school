import { afterEach, describe, expect, it } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { videoEmbed } from './embed'
import type { VideoHost } from '@/config/types'

const VARS = [
  'BUNNY_LIBRARY_ID',
  'BUNNY_TOKEN_KEY',
  'MUX_SIGNING_KEY_ID',
  'MUX_SIGNING_PRIVATE_KEY',
  'CLOUDFLARE_STREAM_CUSTOMER_CODE',
]

afterEach(() => {
  for (const key of VARS) delete process.env[key]
})

describe('every host produces something playable', () => {
  const cases: Array<[VideoHost, string, () => void]> = [
    ['youtube', 'dQw4w9WgXcQ', () => {}],
    ['vimeo', '123456789', () => {}],
    ['loom', 'abc123', () => {}],
    ['bunny', 'guid-1', () => { process.env['BUNNY_LIBRARY_ID'] = '42' }],
    ['mux', 'playback-1', () => {}],
    ['cloudflare-stream', 'vid1', () => { process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'] = 'abc' }],
    ['custom-embed', 'https://example.com/embed/1', () => {}],
  ]

  for (const [host, ref, setup] of cases) {
    it(`${host} returns an https embed URL`, () => {
      setup()
      const embed = videoEmbed({ host, ref })
      expect(embed.problem).toBeUndefined()
      expect(embed.src).toMatch(/^https:\/\//)
    })
  }
})

describe('YouTube', () => {
  it('uses the no-cookie domain, since a student is paying not being tracked', () => {
    expect(videoEmbed({ host: 'youtube', ref: 'abc' }).src).toContain('youtube-nocookie.com')
  })

  it('is honest that the video can be shared', () => {
    // Unlisted is not private. The whole product decision rests on saying so.
    expect(videoEmbed({ host: 'youtube', ref: 'abc' }).protected).toBe(false)
  })
})

describe('Vimeo', () => {
  it('carries a privacy hash when the id has one', () => {
    const embed = videoEmbed({ host: 'vimeo', ref: '123456789/a1b2c3' })
    expect(embed.src).toContain('/video/123456789')
    expect(embed.src).toContain('h=a1b2c3')
  })

  it('asks Vimeo not to track the student', () => {
    expect(videoEmbed({ host: 'vimeo', ref: '123' }).src).toContain('dnt=1')
  })
})

describe('Bunny', () => {
  it('says what is missing rather than showing an empty box', () => {
    const embed = videoEmbed({ host: 'bunny', ref: 'guid-1' })
    expect(embed.problem).toMatch(/BUNNY_LIBRARY_ID/)
  })

  it('plays unsigned when no token key is set, and admits it is unprotected', () => {
    process.env['BUNNY_LIBRARY_ID'] = '42'
    const embed = videoEmbed({ host: 'bunny', ref: 'guid-1' })
    expect(embed.src).toContain('/embed/42/guid-1')
    expect(embed.protected).toBe(false)
  })

  it('signs the URL when a token key is set', () => {
    process.env['BUNNY_LIBRARY_ID'] = '42'
    process.env['BUNNY_TOKEN_KEY'] = 'secret-key'
    const embed = videoEmbed({ host: 'bunny', ref: 'guid-1' })
    expect(embed.src).toMatch(/token=[a-f0-9]{64}/)
    expect(embed.protected).toBe(true)
  })

  it('produces a token that expires', () => {
    process.env['BUNNY_LIBRARY_ID'] = '42'
    process.env['BUNNY_TOKEN_KEY'] = 'secret-key'
    const now = Date.UTC(2026, 0, 1)
    const embed = videoEmbed({ host: 'bunny', ref: 'guid-1' }, now)
    const expires = Number(new URL(embed.src).searchParams.get('expires'))
    expect(expires).toBeGreaterThan(now / 1000)
  })

  it('gives a different token for a different video', () => {
    process.env['BUNNY_LIBRARY_ID'] = '42'
    process.env['BUNNY_TOKEN_KEY'] = 'secret-key'
    const a = videoEmbed({ host: 'bunny', ref: 'guid-1' }, 0)
    const b = videoEmbed({ host: 'bunny', ref: 'guid-2' }, 0)
    expect(a.src).not.toBe(b.src)
  })
})

describe('Mux', () => {
  it('plays a public playback id when no signing key is configured', () => {
    const embed = videoEmbed({ host: 'mux', ref: 'pb-1' })
    expect(embed.src).toBe('https://player.mux.com/pb-1')
    expect(embed.protected).toBe(false)
  })

  it('signs playback with a real RSA key', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env['MUX_SIGNING_KEY_ID'] = 'key-1'
    process.env['MUX_SIGNING_PRIVATE_KEY'] = privateKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString()

    const embed = videoEmbed({ host: 'mux', ref: 'pb-1' })
    expect(embed.protected).toBe(true)

    const token = new URL(embed.src).searchParams.get('token') ?? ''
    const [header, payload] = token.split('.')
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toMatchObject({
      alg: 'RS256',
      kid: 'key-1',
    })
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toMatchObject({
      sub: 'pb-1',
      aud: 'v',
    })
  })

  it('accepts the base64 form of the key that Mux hands out', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    process.env['MUX_SIGNING_KEY_ID'] = 'key-1'
    process.env['MUX_SIGNING_PRIVATE_KEY'] = Buffer.from(pem).toString('base64')

    expect(videoEmbed({ host: 'mux', ref: 'pb-1' }).protected).toBe(true)
  })

  it('explains an unusable key instead of rendering a broken player', () => {
    process.env['MUX_SIGNING_KEY_ID'] = 'key-1'
    process.env['MUX_SIGNING_PRIVATE_KEY'] = 'not-a-key'
    expect(videoEmbed({ host: 'mux', ref: 'pb-1' }).problem).toMatch(/MUX_SIGNING_PRIVATE_KEY/)
  })
})

describe('a custom embed', () => {
  it('refuses anything that is not https', () => {
    // An http:// or javascript: URL in an iframe is somebody else's code running
    // inside the student's session.
    for (const ref of ['http://example.com/x', 'javascript:alert(1)', 'data:text/html,x', '/x']) {
      expect(videoEmbed({ host: 'custom-embed', ref }).problem).toBeTruthy()
    }
  })

  it('passes an https URL straight through', () => {
    const ref = 'https://videos.example.com/embed/7'
    expect(videoEmbed({ host: 'custom-embed', ref }).src).toBe(ref)
  })
})

describe('references with awkward characters', () => {
  it('escapes them rather than letting them change the URL', () => {
    const embed = videoEmbed({ host: 'youtube', ref: 'abc?rel=1&evil=1' })
    expect(new URL(embed.src).pathname).toBe('/embed/abc%3Frel%3D1%26evil%3D1')
  })
})
