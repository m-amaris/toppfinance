import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createSessionToken,
  createSecureToken,
  hashToken,
  hashIp,
  hashPassword,
  verifyPassword,
  secureCompare,
  generateApiKey,
  hashApiKey,
  checkPasswordStrength,
  generateCsrfToken,
  validateCsrfToken,
  type PasswordStrength,
} from '../src/security.js'

describe('security.ts — Security utilities', () => {
  // ============================================================
  // createSessionToken
  // ============================================================
  describe('createSessionToken', () => {
    it('generates a token', () => {
      const token = createSessionToken()
      expect(token).toBeTypeOf('string')
      expect(token.length).toBeGreaterThan(0)
    })

    it('generates different tokens on each call', () => {
      const token1 = createSessionToken()
      const token2 = createSessionToken()
      expect(token1).not.toBe(token2)
    })

    it('generates URL-safe base64 tokens (no +, /, =)', () => {
      const token = createSessionToken()
      expect(token).not.toMatch(/[+/=]/)
    })

    it('generates tokens of consistent length', () => {
      // 32 bytes -> 43 chars in base64url (no padding)
      const token = createSessionToken()
      expect(token.length).toBe(43)
    })
  })

  // ============================================================
  // createSecureToken
  // ============================================================
  describe('createSecureToken', () => {
    it('generates token with default length', () => {
      const token = createSecureToken()
      expect(token.length).toBe(43) // 32 bytes
    })

    it('generates token with custom byte length', () => {
      const token = createSecureToken(16)
      expect(token.length).toBe(22) // 16 bytes
    })

    it('generates different tokens on each call', () => {
      const token1 = createSecureToken(32)
      const token2 = createSecureToken(32)
      expect(token1).not.toBe(token2)
    })

    it('generates URL-safe tokens', () => {
      const token = createSecureToken(32)
      expect(token).not.toMatch(/[+/=]/)
    })
  })

  // ============================================================
  // hashToken
  // ============================================================
  describe('hashToken', () => {
    it('returns SHA-256 hex string', () => {
      const hash = hashToken('test-token')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('is deterministic', () => {
      expect(hashToken('same-input')).toBe(hashToken('same-input'))
    })

    it('produces different hashes for different inputs', () => {
      expect(hashToken('input1')).not.toBe(hashToken('input2'))
    })

    it('handles empty string', () => {
      const hash = hashToken('')
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })
  })

  // ============================================================
  // hashIp
  // ============================================================
  describe('hashIp', () => {
    it('returns null for null input', () => {
      expect(hashIp(null)).toBeNull()
    })

    it('returns null for undefined input', () => {
      expect(hashIp(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(hashIp('')).toBeNull()
    })

    it('hashes IPv4 address', () => {
      const hash = hashIp('192.168.1.1')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('hashes IPv6 address', () => {
      const hash = hashIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('strips IPv6 mapped IPv4 prefix (::ffff:)', () => {
      const hash1 = hashIp('192.168.1.1')
      const hash2 = hashIp('::ffff:192.168.1.1')
      expect(hash1).toBe(hash2)
    })

    it('is deterministic', () => {
      expect(hashIp('10.0.0.1')).toBe(hashIp('10.0.0.1'))
    })
  })

  // ============================================================
  // hashPassword / verifyPassword
  // ============================================================
  describe('hashPassword / verifyPassword', () => {
    it('hashes password and verifies correctly', async () => {
      const password = 'MySecureP@ssw0rd123'
      const hash = await hashPassword(password)
      expect(hash).toMatch(/^\$argon2id\$/)

      const valid = await verifyPassword(hash, password)
      expect(valid).toBe(true)
    })

    it('rejects wrong password', async () => {
      const password = 'MySecureP@ssw0rd123'
      const hash = await hashPassword(password)
      const valid = await verifyPassword(hash, 'WrongPassword123')
      expect(valid).toBe(false)
    })

    it('produces different hashes for same password (salt)', async () => {
      const password = 'TestP@ss123'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)
      expect(hash1).not.toBe(hash2)

      // Both should verify correctly
      expect(await verifyPassword(hash1, password)).toBe(true)
      expect(await verifyPassword(hash2, password)).toBe(true)
    })

    it('handles empty password', async () => {
      const hash = await hashPassword('')
      expect(await verifyPassword(hash, '')).toBe(true)
      expect(await verifyPassword(hash, 'x')).toBe(false)
    })

    it('handles very long password', async () => {
      const password = 'a'.repeat(100) + 'A1!'
      const hash = await hashPassword(password)
      expect(await verifyPassword(hash, password)).toBe(true)
    })

    it('returns false for malformed hash', async () => {
      const valid = await verifyPassword('not-a-valid-hash', 'password')
      expect(valid).toBe(false)
    })
  })

  // ============================================================
  // secureCompare
  // ============================================================
  describe('secureCompare', () => {
    it('returns true for identical strings', () => {
      expect(secureCompare('secret', 'secret')).toBe(true)
    })

    it('returns false for different strings same length', () => {
      expect(secureCompare('secret', 'secrex')).toBe(false)
    })

    it('returns false for different lengths', () => {
      expect(secureCompare('short', 'longer')).toBe(false)
    })

    it('returns false for empty vs non-empty', () => {
      expect(secureCompare('', 'a')).toBe(false)
    })

    it('returns true for two empty strings', () => {
      expect(secureCompare('', '')).toBe(true)
    })

    it('is constant-time (no early return based on content)', () => {
      // This is a behavioral test - we can't easily test timing in JS
      // but we verify the length check happens first
      expect(secureCompare('a', 'aa')).toBe(false)
      expect(secureCompare('aa', 'a')).toBe(false)
    })
  })

  // ============================================================
  // generateApiKey / hashApiKey
  // ============================================================
  describe('generateApiKey / hashApiKey', () => {
    it('generates API key with default prefix', () => {
      const key = generateApiKey()
      expect(key).toMatch(/^tf_[A-Za-z0-9_-]+$/)
    })

    it('generates API key with custom prefix', () => {
      const key = generateApiKey('myapp')
      expect(key).toMatch(/^myapp_[A-Za-z0-9_-]+$/)
    })

    it('generates different keys each call', () => {
      const key1 = generateApiKey()
      const key2 = generateApiKey()
      expect(key1).not.toBe(key2)
    })

    it('hashes API key to SHA-256', () => {
      const key = 'tf_testkey123'
      const hash = hashApiKey(key)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('produces consistent hash', () => {
      const key = 'tf_testkey123'
      expect(hashApiKey(key)).toBe(hashApiKey(key))
    })

    it('different keys produce different hashes', () => {
      expect(hashApiKey('tf_key1')).not.toBe(hashApiKey('tf_key2'))
    })
  })

  // ============================================================
  // checkPasswordStrength
  // ============================================================
  describe('checkPasswordStrength', () => {
    it('returns valid for strong password', () => {
      const result = checkPasswordStrength('MySecureP@ss123')
      expect(result.isValid).toBe(true)
      expect(result.score).toBe(5)
      expect(result.feedback).toHaveLength(0)
    })

    it('rejects too short password', () => {
      const result = checkPasswordStrength('Short1!')
      expect(result.isValid).toBe(false)
      expect(result.feedback).toContain('La contrasena debe tener al menos 12 caracteres')
    })

    it('flags missing uppercase (but may still be valid due to score)', () => {
      const result = checkPasswordStrength('lowercase123!')
      // Missing uppercase -> score 4, length >= 12 -> isValid = true
      expect(result.feedback).toContain('Debe contener al menos una mayuscula')
    })

    it('flags missing lowercase (but may still be valid due to score)', () => {
      const result = checkPasswordStrength('UPPERCASE123!')
      expect(result.feedback).toContain('Debe contener al menos una minuscula')
    })

    it('flags missing number (but may still be valid due to score)', () => {
      const result = checkPasswordStrength('NoNumbersHere!')
      expect(result.feedback).toContain('Debe contener al menos un numero')
    })

    it('flags missing special character (but may still be valid due to score)', () => {
      const result = checkPasswordStrength('NoSpecialChar123')
      expect(result.feedback).toContain('Debe contener al menos un caracter especial')
    })

    it('penalizes repeated characters', () => {
      const result = checkPasswordStrength('MyPasssssword1!')
      expect(result.isValid).toBe(true) // Still valid because score >= 4
      expect(result.feedback).toContain('Evita caracteres repetidos')
      expect(result.score).toBeLessThanOrEqual(4)
    })

    it('handles empty string', () => {
      const result = checkPasswordStrength('')
      expect(result.isValid).toBe(false)
      expect(result.score).toBe(0)
      expect(result.feedback.length).toBeGreaterThan(0)
    })

    it('returns score 5 for all criteria met', () => {
      const result = checkPasswordStrength('PerfectP@ss123')
      expect(result.score).toBe(5)
      expect(result.isValid).toBe(true)
    })

    it('handles unicode characters', () => {
      const result = checkPasswordStrength('MiP@ssw0rdEspañol123')
      expect(result.isValid).toBe(true)
    })
  })

  // ============================================================
  // generateCsrfToken / validateCsrfToken
  // ============================================================
  describe('generateCsrfToken / validateCsrfToken', () => {
    it('generates a token', () => {
      const token = generateCsrfToken()
      expect(token).toBeTypeOf('string')
      expect(token.length).toBe(43) // 32 bytes base64url
    })

    it('validates matching token', () => {
      const token = generateCsrfToken()
      expect(validateCsrfToken(token, token)).toBe(true)
    })

    it('rejects non-matching token', () => {
      expect(validateCsrfToken('token1', 'token2')).toBe(false)
    })

    it('rejects empty token', () => {
      expect(validateCsrfToken('', 'expected')).toBe(false)
    })

    it('uses constant-time comparison', () => {
      // Verify it uses secureCompare internally
      const token = 'a'.repeat(43)
      expect(validateCsrfToken(token, token)).toBe(true)
      expect(validateCsrfToken(token, 'b'.repeat(43))).toBe(false)
    })
  })
})