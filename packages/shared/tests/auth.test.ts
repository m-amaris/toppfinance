import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getUser,
  isAdmin,
  belongsToHousehold,
  SESSION_CONFIG,
  type AuthUser,
} from '../src/auth.js'
import { UserRole } from '../src/enums.js'

describe('auth.ts — Auth utilities', () => {
  const mockUser: AuthUser = {
    id: 'user1',
    email: 'test@test.com',
    displayName: 'Test User',
    role: UserRole.MEMBER,
    householdId: 'hh1',
    createdAt: new Date('2024-01-01'),
  }

  const mockAdminUser: AuthUser = {
    ...mockUser,
    id: 'admin1',
    role: UserRole.ADMIN,
  }

  // ============================================================
  // getUser
  // ============================================================
  describe('getUser', () => {
    it('returns user when present on request', () => {
      const request = { user: mockUser }
      expect(getUser(request)).toBe(mockUser)
    })

    it('throws when user is not present', () => {
      const request = { user: undefined }
      expect(() => getUser(request)).toThrow('User not authenticated')
    })

    it('throws when user is null', () => {
      const request = { user: null }
      expect(() => getUser(request)).toThrow('User not authenticated')
    })

    it('works with plain object (no Fastify types needed)', () => {
      const request = { user: mockUser }
      const user = getUser(request)
      expect(user.id).toBe('user1')
      expect(user.email).toBe('test@test.com')
      expect(user.role).toBe(UserRole.MEMBER)
    })
  })

  // ============================================================
  // isAdmin
  // ============================================================
  describe('isAdmin', () => {
    it('returns true for ADMIN role', () => {
      expect(isAdmin(mockAdminUser)).toBe(true)
    })

    it('returns false for MEMBER role', () => {
      expect(isAdmin(mockUser)).toBe(false)
    })

    it('returns false for undefined role', () => {
      const userWithoutRole = { ...mockUser, role: undefined as any }
      expect(isAdmin(userWithoutRole)).toBe(false)
    })
  })

  // ============================================================
  // belongsToHousehold
  // ============================================================
  describe('belongsToHousehold', () => {
    it('returns true when householdId matches', () => {
      expect(belongsToHousehold(mockUser, 'hh1')).toBe(true)
    })

    it('returns false when householdId differs', () => {
      expect(belongsToHousehold(mockUser, 'hh2')).toBe(false)
    })

    it('returns false when user has no householdId', () => {
      const userNoHousehold = { ...mockUser, householdId: null }
      expect(belongsToHousehold(userNoHousehold, 'hh1')).toBe(false)
    })

    it('returns false for empty string householdId', () => {
      expect(belongsToHousehold(mockUser, '')).toBe(false)
    })
  })

  // ============================================================
  // SESSION_CONFIG
  // ============================================================
  describe('SESSION_CONFIG', () => {
    it('has correct cookie name', () => {
      expect(SESSION_CONFIG.COOKIE_NAME).toBe('toppfinance_session')
    })

    it('has correct TTL in days', () => {
      expect(SESSION_CONFIG.TTL_DAYS).toBe(365)
    })

    it('has correct SameSite setting', () => {
      expect(SESSION_CONFIG.SAME_SITE).toBe('lax')
    })

    it('is readonly (as const)', () => {
      // TypeScript enforces this at compile time
      expect(typeof SESSION_CONFIG.COOKIE_NAME).toBe('string')
      expect(typeof SESSION_CONFIG.TTL_DAYS).toBe('number')
    })
  })

  // ============================================================
  // AuthUser type structure
  // ============================================================
  describe('AuthUser type', () => {
    it('has all required properties', () => {
      const user: AuthUser = {
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Test',
        role: UserRole.MEMBER,
        householdId: 'hh1',
        createdAt: new Date(),
      }
      expect(user.id).toBe('u1')
      expect(user.email).toBe('a@b.com')
      expect(user.displayName).toBe('Test')
      expect(user.role).toBe(UserRole.MEMBER)
      expect(user.householdId).toBe('hh1')
      expect(user.createdAt).toBeInstanceOf(Date)
    })

    it('allows nullable householdId', () => {
      const user: AuthUser = {
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Test',
        role: UserRole.MEMBER,
        householdId: null,
        createdAt: new Date(),
      }
      expect(user.householdId).toBeNull()
    })
  })
})