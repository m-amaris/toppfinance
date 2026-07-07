import { randomBytes, createHash } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function hashIp(ip?: string) {
  if (!ip) return null
  return createHash('sha256').update(ip).digest('hex')
}

export function hashPassword(password: string) {
  return hash(password)
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password)
}
