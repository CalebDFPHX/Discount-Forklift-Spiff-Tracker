/**
 * Discount Forklift Spiff Tracker - Cryptographic Session & CSRF Security Module
 * Manages signed session tokens, session cookies, CSRF protection, and administrator allowlist verification.
 * Does NOT trust client-supplied headers or domain wildcards.
 * Rejects expired, tampered, deactivated, or revoked sessions.
 */

import crypto from 'crypto';
import { db, schema, isNeonConfigured } from '../db/index';
import { eq } from 'drizzle-orm';
import { memoryStore, isMemoryModeAllowed } from './repository';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Retrieves the cryptographic signing key from environment variables.
 * Never falls back to a hardcoded or default secret.
 */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('Authentication signing key (AUTH_SECRET) is not configured in environment. Protected administrator operations are disabled.');
  }
  return secret.trim();
}

/**
 * Checks whether an authentication secret is configured in the environment.
 */
export function isAuthSecretConfigured(): boolean {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  return Boolean(secret && secret.trim().length > 0);
}

export interface SessionPayload {
  email: string;
  name?: string | null;
  role: string;
  iat: number;
  exp: number;
  nonce: string;
}

/**
 * Signs a session payload using HMAC-SHA256 with the mandatory environment AUTH_SECRET.
 */
export function createSessionToken(email: string, name?: string | null, role: string = 'Administrator'): string {
  const secret = getAuthSecret();
  const now = Date.now();

  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    name: name || null,
    role,
    iat: now,
    exp: now + SESSION_TTL_MS,
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a signed session token. Returns the validated payload or null if invalid/expired.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  if (!isAuthSecretConfigured()) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  let secret: string;
  try {
    secret = getAuthSecret();
  } catch {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!payload.email || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Generates a CSRF token bound to a session email
 */
export function createCsrfToken(email: string): string {
  const secret = getAuthSecret();
  const data = `${email.toLowerCase()}:${Date.now()}`;
  const dataB64 = Buffer.from(data).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(dataB64).digest('base64url');
  return `${dataB64}.${sig}`;
}

/**
 * Validates a CSRF token
 */
export function verifyCsrfToken(token: string, expectedEmail: string): boolean {
  if (!token || typeof token !== 'string') return false;
  if (!isAuthSecretConfigured()) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [dataB64, sig] = parts;
  let secret: string;
  try {
    secret = getAuthSecret();
  } catch {
    return false;
  }

  const expectedSig = crypto.createHmac('sha256', secret).update(dataB64).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  try {
    const raw = Buffer.from(dataB64, 'base64url').toString('utf-8');
    const [tokenEmail, timestampStr] = raw.split(':');
    if (tokenEmail !== expectedEmail.toLowerCase()) return false;
    const ts = parseInt(timestampStr, 10);
    // CSRF valid for 24 hours
    if (isNaN(ts) || Date.now() - ts > SESSION_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies that the administrator account is present in the Neon database
 * AND currently has isAuthorized === true.
 * Rejects deactivated users, wildcards, and sessions issued prior to a password reset.
 */
export async function verifyAdminPermissions(
  email: string,
  sessionIat?: number
): Promise<{
  isAuthorized: boolean;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    role: string;
    mustChangePassword?: boolean;
    passwordChangedAt?: string | null;
  };
  error?: string;
}> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check Neon PostgreSQL database if connected
  if (isNeonConfigured && db) {
    try {
      const records = await db
        .select()
        .from(schema.adminUsers)
        .where(eq(schema.adminUsers.email, cleanEmail));

      if (records.length === 0) {
        return { isAuthorized: false, error: 'User is not on the administrator allowlist.' };
      }

      const admin = records[0];
      if (!admin.isAuthorized) {
        return { isAuthorized: false, error: 'Administrator account has been deactivated.' };
      }

      // Check if session was revoked due to a password reset / change
      if (sessionIat && admin.passwordChangedAt) {
        const changedTs = new Date(admin.passwordChangedAt).getTime();
        if (changedTs > sessionIat) {
          return {
            isAuthorized: false,
            error: 'Password was changed or reset. Session has been revoked. Please sign in again.',
          };
        }
      }

      return {
        isAuthorized: true,
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          mustChangePassword: Boolean((admin as any).mustChangePassword),
          passwordChangedAt: admin.passwordChangedAt ? admin.passwordChangedAt.toISOString() : null,
        },
      };
    } catch (err: any) {
      console.error('[SessionAuth] Error checking Neon admin permission:', err);
      return { isAuthorized: false, error: `Database authorization check failed: ${err.message}` };
    }
  }

  // 2. Local memory fallback for preview/test environment
  if (!isMemoryModeAllowed()) {
    return {
      isAuthorized: false,
      error: 'Database connection required in production or when memory fallback is disabled.',
    };
  }

  const user = (memoryStore.adminUsers as any[]).find(
    (u: any) => u.email.toLowerCase() === cleanEmail
  );
  if (!user) {
    return { isAuthorized: false, error: 'User is not on the administrator allowlist.' };
  }
  if (!user.isAuthorized) {
    return { isAuthorized: false, error: 'Administrator account has been deactivated.' };
  }

  if (sessionIat && user.passwordChangedAt) {
    const changedTs = new Date(user.passwordChangedAt).getTime();
    if (changedTs > sessionIat) {
      return {
        isAuthorized: false,
        error: 'Password was changed or reset. Session has been revoked. Please sign in again.',
      };
    }
  }

  return {
    isAuthorized: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'Administrator',
      mustChangePassword: Boolean(user.mustChangePassword),
      passwordChangedAt: user.passwordChangedAt || null,
    },
  };
}
