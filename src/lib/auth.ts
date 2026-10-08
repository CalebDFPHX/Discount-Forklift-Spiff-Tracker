/**
 * Discount Forklift Spiff Tracker - Password Hashing & Verification
 * Uses Node.js crypto.scrypt with cryptographically random 16-byte unique salts.
 * Plaintext passwords and plaintext fallbacks are strictly prohibited.
 */

import crypto from 'crypto';

const SALT_BYTES = 16;
const KEY_LEN_BYTES = 64;

/**
 * Securely hashes a plain text password with a unique 16-byte salt using scrypt.
 * Returns formatted string: `${salt}:${hash}`
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LEN_BYTES).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a plain text password against the stored salt:hash string using timing-safe comparison.
 * Never allows plaintext comparison.
 */
export function verifyPassword(password: string, storedHash?: string | null): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;

  if (!storedHash.includes(':')) {
    // Legacy or invalid non-salted hashes are strictly rejected
    return false;
  }

  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, KEY_LEN_BYTES);
    if (keyBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Validates password strength for administrators:
 * - Minimum 8 characters
 * - At least one letter
 * - At least one number
 */
export function validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { isValid: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one digit.' };
  }
  return { isValid: true };
}
