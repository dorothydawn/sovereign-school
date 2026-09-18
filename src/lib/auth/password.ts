import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto'

/**
 * promisify() drops the overload that takes options, and the options are the
 * whole point here — they carry the cost parameters.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

/**
 * Passwords are hashed with scrypt from Node's standard library.
 *
 * Deliberately not bcrypt or argon2: both mean a native module, which means a
 * buyer's install can fail on their machine for reasons neither they nor their
 * agent can diagnose. scrypt is memory-hard, built in, and needs nothing
 * installed.
 */
const KEY_LENGTH = 64
const COST = 16384 // 2^14. Roughly 100ms per hash, which is the point.
const BLOCK_SIZE = 8
const PARALLELISATION = 1

/** Stored as `scrypt$N$r$p$salt$hash`, so the cost can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISATION,
  })

  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISATION,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$')
}

/**
 * Checks a password against a stored hash.
 *
 * Returns false rather than throwing on anything malformed: a corrupt row must
 * fail closed, not crash the sign-in page.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false

  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, costRaw, blockRaw, parallelRaw, saltHex, hashHex] = parts
  const cost = Number(costRaw)
  const blockSize = Number(blockRaw)
  const parallelisation = Number(parallelRaw)

  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelisation)) {
    return false
  }
  if (!saltHex || !hashHex) return false

  try {
    const expected = Buffer.from(hashHex, 'hex')
    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: cost,
      r: blockSize,
      p: parallelisation,
    })

    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/**
 * Whether a password is acceptable.
 *
 * Length only. Character-class rules push people towards `Passw0rd!` and are
 * worse than a long passphrase, and this is a course, not a bank.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.'
  if (password.length > 200) return 'That is longer than 200 characters.'
  return null
}
