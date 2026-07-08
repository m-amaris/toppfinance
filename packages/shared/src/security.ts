/**
 * Security utilities.
 * Provides hashing, token generation, and password utilities.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/**
 * Generates a cryptographically secure session token.
 * Uses base64url encoding for URL-safe tokens.
 */
export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generates a secure random string of specified length.
 */
export function createSecureToken(byteLength: number = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Hashes a token using SHA-256 (for storage).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Hashes an IP address for privacy-preserving storage.
 */
export function hashIp(ip?: string | null): string | null {
  if (!ip) return null;
  // Handle IPv6 mapped IPv4 addresses
  const cleanIp = ip.replace(/^::ffff:/, '');
  return createHash('sha256').update(cleanIp).digest('hex');
}

/**
 * Hashes a password using Argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456, // ~19 MB
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
}

/**
 * Verifies a password against an Argon2id hash.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Generates a random API key.
 */
export function generateApiKey(prefix: string = 'tf'): string {
  const randomPart = randomBytes(24).toString('base64url');
  return prefix + '_' + randomPart;
}

/**
 * Hashes an API key for storage.
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Validates password strength.
 */
export interface PasswordStrength {
  score: number; // 0-4
  feedback: string[];
  isValid: boolean;
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 12) score++;
  else feedback.push('La contrasena debe tener al menos 12 caracteres');

  if (/[A-Z]/.test(password)) score++;
  else feedback.push('Debe contener al menos una mayuscula');

  if (/[a-z]/.test(password)) score++;
  else feedback.push('Debe contener al menos una minuscula');

  if (/[0-9]/.test(password)) score++;
  else feedback.push('Debe contener al menos un numero');

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push('Debe contener al menos un caracter especial');

  // Check for common patterns
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(0, score - 1);
    feedback.push('Evita caracteres repetidos');
  }

  return {
    score,
    feedback,
    isValid: score >= 4 && password.length >= 12,
  };
}

/**
 * Sanitizes a string for safe use in HTML/attributes.
 */

/**
 * Generates a secure random string for CSRF tokens, etc.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Validates a CSRF token.
 */
export function validateCsrfToken(token: string, expectedToken: string): boolean {
  return secureCompare(token, expectedToken);
}