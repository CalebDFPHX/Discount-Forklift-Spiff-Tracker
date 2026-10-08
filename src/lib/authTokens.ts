/**
 * Discount Forklift Spiff Tracker - Administrator Authentication Tokens
 * Manages expiring, single-use tokens for:
 * 1. Administrator invitations
 * 2. Password reset links
 * 3. Initial administrator setup
 *
 * Tokens are stored hashed (SHA-256) in the database so raw tokens cannot be recovered from storage.
 */

import crypto from 'crypto';
import { db, schema, isNeonConfigured } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { memoryStore, AdminUser, isMemoryModeAllowed } from './repository.js';
import { hashPassword, validatePasswordStrength } from './auth.js';

export interface AdminAuthTokenRecord {
  id: string;
  adminId: string;
  tokenHash: string;
  tokenType: 'invite' | 'password_reset' | 'initial_setup';
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generates an expiring single-use token for an administrator account.
 * Returns the raw token to be delivered via email or secure link.
 */
export async function createAdminAuthToken(params: {
  adminId: string;
  tokenType: 'invite' | 'password_reset' | 'initial_setup';
  createdBy?: string;
  expiresInMs?: number;
}): Promise<{ rawToken: string; expiresAt: string; id: string }> {
  const { adminId, tokenType, createdBy, expiresInMs } = params;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const ttl = expiresInMs || (tokenType === 'invite' ? INVITE_TTL_MS : RESET_TTL_MS);
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const now = new Date().toISOString();
  const id = `tok_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const tokenRecord: AdminAuthTokenRecord = {
    id,
    adminId,
    tokenHash,
    tokenType,
    expiresAt,
    usedAt: null,
    createdAt: now,
    createdBy: createdBy || null,
  };

  if (isNeonConfigured && db) {
    try {
      await db.insert(schema.adminAuthTokens).values({
        id,
        adminId,
        tokenHash,
        tokenType,
        expiresAt: new Date(expiresAt),
        createdAt: new Date(now),
        createdBy: createdBy || null,
      });
    } catch (err) {
      console.error('[AuthTokens] Failed to save token in Neon:', err);
    }
  }

  // Also retain in memoryStore
  memoryStore.adminAuthTokens.push(tokenRecord);

  return { rawToken, expiresAt, id };
}

/**
 * Validates an auth token. Ensures token exists, has not been used, and has not expired.
 */
export async function verifyAdminAuthToken(rawToken: string): Promise<{
  isValid: boolean;
  tokenRecord?: AdminAuthTokenRecord;
  adminUser?: AdminUser;
  error?: string;
}> {
  if (!rawToken || typeof rawToken !== 'string') {
    return { isValid: false, error: 'Token is missing.' };
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  const now = new Date();

  let tokenRecord: AdminAuthTokenRecord | undefined;
  let adminUser: AdminUser | undefined;

  if (isNeonConfigured && db) {
    try {
      const rows = await db
        .select()
        .from(schema.adminAuthTokens)
        .where(eq(schema.adminAuthTokens.tokenHash, tokenHash))
        .limit(1);

      if (rows.length > 0) {
        const row = rows[0];
        tokenRecord = {
          id: row.id,
          adminId: row.adminId,
          tokenHash: row.tokenHash,
          tokenType: row.tokenType as any,
          expiresAt: row.expiresAt.toISOString(),
          usedAt: row.usedAt ? row.usedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
          createdBy: row.createdBy,
        };

        const userRows = await db
          .select()
          .from(schema.adminUsers)
          .where(eq(schema.adminUsers.id, row.adminId))
          .limit(1);

        if (userRows.length > 0) {
          const u = userRows[0];
          adminUser = {
            id: u.id,
            email: u.email,
            name: u.name,
            role: (u as any).role || 'Administrator',
            passwordHash: u.passwordHash,
            isAuthorized: u.isAuthorized,
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
            passwordChangedAt: u.passwordChangedAt ? u.passwordChangedAt.toISOString() : null,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
          };
        }
      }
    } catch (err) {
      if (!isMemoryModeAllowed()) throw err;
      console.warn('[AuthTokens] Neon query error verifying token:', err);
    }
  }

  if (!tokenRecord && isMemoryModeAllowed()) {
    tokenRecord = memoryStore.adminAuthTokens.find((t) => t.tokenHash === tokenHash);
    if (tokenRecord) {
      adminUser = memoryStore.adminUsers.find((u) => u.id === tokenRecord!.adminId);
    }
  }

  if (!tokenRecord) {
    return { isValid: false, error: 'The setup or reset link is invalid.' };
  }

  if (tokenRecord.usedAt) {
    return { isValid: false, error: 'This setup link has already been used and cannot be reused.' };
  }

  if (new Date(tokenRecord.expiresAt) < now) {
    return { isValid: false, error: 'This link has expired. Please request a new invitation or password reset.' };
  }

  if (!adminUser) {
    return { isValid: false, error: 'Associated administrator account was not found.' };
  }

  return { isValid: true, tokenRecord, adminUser };
}

/**
 * Consumes an expiring single-use token and updates the administrator password.
 * Marks the token as used, updates password_hash and password_changed_at,
 * thereby revoking all previous active sessions.
 */
export async function consumeAdminAuthToken(
  rawToken: string,
  newPassword: string
): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
  const verification = await verifyAdminAuthToken(rawToken);
  if (!verification.isValid || !verification.tokenRecord || !verification.adminUser) {
    return { success: false, error: verification.error || 'Invalid token.' };
  }

  const strengthCheck = validatePasswordStrength(newPassword);
  if (!strengthCheck.isValid) {
    return { success: false, error: strengthCheck.error };
  }

  const { tokenRecord, adminUser } = verification;
  const newHash = hashPassword(newPassword);
  const nowIso = new Date().toISOString();
  const nowDate = new Date();

  // Atomically mark token used and update admin user in Neon
  if (isNeonConfigured && db) {
    try {
      await db.transaction(async (tx) => {
        // Enforce single-use: must not be used yet
        const [updatedToken] = await tx
          .update(schema.adminAuthTokens)
          .set({ usedAt: nowDate })
          .where(and(eq(schema.adminAuthTokens.id, tokenRecord.id), sql`${schema.adminAuthTokens.usedAt} IS NULL`))
          .returning();

        if (!updatedToken) {
          throw new Error('This setup link has already been used.');
        }

        await tx
          .update(schema.adminUsers)
          .set({
            passwordHash: newHash,
            passwordChangedAt: nowDate,
            isAuthorized: true,
            mustChangePassword: false,
            updatedAt: nowDate,
          })
          .where(eq(schema.adminUsers.id, adminUser.id));
      });
    } catch (err: any) {
      console.error('[AuthTokens] Neon transaction error consuming token:', err);
      return { success: false, error: err.message || 'Failed to update administrator password.' };
    }
  }

  // Update memoryStore
  tokenRecord.usedAt = nowIso;
  adminUser.passwordHash = newHash;
  adminUser.passwordChangedAt = nowIso;
  adminUser.isAuthorized = true;
  adminUser.mustChangePassword = false;
  adminUser.updatedAt = nowIso;

  const memUser = memoryStore.adminUsers.find((u) => u.id === adminUser.id);
  if (memUser) {
    memUser.passwordHash = newHash;
    memUser.passwordChangedAt = nowIso;
    memUser.isAuthorized = true;
    memUser.mustChangePassword = false;
    memUser.updatedAt = nowIso;
  }

  return { success: true, user: adminUser };
}
