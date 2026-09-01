import crypto from 'node:crypto'

// Shared by the HTTP API (index.js) and the offline manager CLI
// (manageManagers.js) so both ever only ever hash/compare passwords the
// same way.
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

export const passwordHash = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => {
  crypto.scrypt(String(password), salt, 64, (error, derivedKey) => {
    if (error) return reject(error)
    resolve(`${salt}:${derivedKey.toString('hex')}`)
  })
})

export const passwordMatches = async (password, storedHash) => {
  const [salt, expected] = String(storedHash || '').split(':')
  if (!salt || !expected) return false
  const actual = await passwordHash(password, salt)
  const actualBuffer = Buffer.from(actual.split(':')[1], 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}
