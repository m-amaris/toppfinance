/**
 * Auth types and utilities.
 * Defines the authenticated user shape and session types.
 * Types derived from Zod schemas live in types.ts (z.infer).
 * This file contains only types NOT derivable from schemas + helpers.
 */

import { UserRole } from './enums.js';
import type { z } from 'zod';
import type {
  loginBodySchema,
  sessionUserSchema,
  householdSchema,
} from './schemas.js';

// Re-export the inferred types for convenience
import type { LoginBody, SessionUserResponse, HouseholdResponse } from './types.js';
export type { LoginBody, SessionUserResponse, HouseholdResponse };

/**
 * Authenticated user from session.
 * This is attached to FastifyRequest after authentication.
 * NOT derivable from a Zod schema (it's runtime state, not a request/response shape).
 */
export interface AuthUser {
  id: string;
  householdId: string;
  email: string;
  displayName: string;
  role: UserRole;
}

/**
 * Session cookie options.
 */
export interface SessionCookieOptions {
  maxAge: number;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
}

/**
 * Type for the user object attached to FastifyRequest.
 * This extends the FastifyRequest interface.
 */
// Module augmentation must be done in the app that uses fastify
// declare module 'fastify' {
//   interface FastifyRequest {
//     user?: AuthUser;
//   }
// }

/**
 * Extracts user from request (with type guard).
 */
export function getUser(request: { user?: AuthUser }): AuthUser {
  if (!request.user) {
    throw new Error('User not authenticated');
  }
  return request.user;
}

/**
 * Checks if user has admin role.
 */
export function isAdmin(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN;
}

/**
 * Checks if user belongs to a household.
 */
export function belongsToHousehold(user: AuthUser, householdId: string): boolean {
  return user.householdId === householdId;
}

/**
 * Session configuration constants.
 */
export const SESSION_CONFIG = {
  COOKIE_NAME: 'toppfinance_session',
  TTL_DAYS: 365,
  SAME_SITE: 'lax' as const,
} as const;