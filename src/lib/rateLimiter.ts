/**
 * Discount Forklift Spiff Tracker - Shared Rate Limiting Module
 * Backed by Neon PostgreSQL (rate_limits table) for multi-instance persistence.
 * Uses trusted platform IP headers (x-forwarded-for, x-real-ip) and enforces strict limits.
 * In production, requires database persistence and rejects requests if unavailable.
 */

import express from 'express';
import { db, schema, isNeonConfigured } from '../db/index';
import { eq, sql } from 'drizzle-orm';

export function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

const memoryRateLimitMap = new Map<string, { count: number; resetAt: number }>();

export interface RateLimiterOptions {
  limit: number;
  windowMs?: number;
  prefix?: string;
  errorMessage?: string;
}

export function createPersistentRateLimiter(options: RateLimiterOptions) {
  const limit = options.limit;
  const windowMs = options.windowMs || 60000;
  const prefix = options.prefix || 'rl';
  const errorMessage =
    options.errorMessage || 'Too many requests. Please slow down and try again shortly.';

  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = getClientIp(req);
    const key = `${prefix}:${ip}`;
    const now = new Date();
    const nowTs = now.getTime();

    // 1. Neon Database Shared Rate Limiting across serverless / multiple instances
    if (isNeonConfigured && db) {
      try {
        const resetAtDate = new Date(nowTs + windowMs);

        // Fetch current rate limit record
        const rows = await db
          .select()
          .from(schema.rateLimits)
          .where(eq(schema.rateLimits.key, key))
          .limit(1);

        if (rows.length === 0 || rows[0].resetAt.getTime() <= nowTs) {
          // Window expired or new key: upsert fresh record
          await db
            .insert(schema.rateLimits)
            .values({
              key,
              count: 1,
              resetAt: resetAtDate,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: schema.rateLimits.key,
              set: {
                count: 1,
                resetAt: resetAtDate,
                updatedAt: now,
              },
            });
          return next();
        }

        const current = rows[0];
        if (current.count >= limit) {
          const retryAfterSec = Math.max(1, Math.ceil((current.resetAt.getTime() - nowTs) / 1000));
          res.setHeader('Retry-After', retryAfterSec);
          return res.status(429).json({
            error: errorMessage,
            retryAfter: retryAfterSec,
          });
        }

        // Increment count atomically
        await db
          .update(schema.rateLimits)
          .set({
            count: sql`${schema.rateLimits.count} + 1`,
            updatedAt: now,
          })
          .where(eq(schema.rateLimits.key, key));

        return next();
      } catch (err: any) {
        console.error('[RateLimiter] Database rate limiting error:', err);
        if (process.env.NODE_ENV === 'production') {
          return res.status(503).json({
            error: 'Shared rate limiting service is temporarily unavailable. Request rejected.',
          });
        }
      }
    }

    // In production without Neon configured, do not silently claim persistence
    if (process.env.NODE_ENV === 'production' && !isNeonConfigured) {
      return res.status(503).json({
        error: 'Persistent database storage (DATABASE_URL) is required in production for rate limiting.',
      });
    }

    // 2. Local memory fallback for local development / test preview
    const record = memoryRateLimitMap.get(key);
    if (!record || nowTs > record.resetAt) {
      memoryRateLimitMap.set(key, { count: 1, resetAt: nowTs + windowMs });
      return next();
    }

    if (record.count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - nowTs) / 1000));
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: errorMessage,
        retryAfter: retryAfterSec,
      });
    }

    record.count++;
    return next();
  };
}
