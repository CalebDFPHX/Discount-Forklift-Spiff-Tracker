-- Migration: 0004_reliable_email_queue.sql
-- Adds distributed locking, lease expiration, retry schedules, and delivery timestamps to email_notification_jobs
-- Safe, non-destructive migration preserving all existing rows and indexes.

ALTER TABLE "email_notification_jobs" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp with time zone;
ALTER TABLE "email_notification_jobs" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;
ALTER TABLE "email_notification_jobs" ADD COLUMN IF NOT EXISTS "locked_by" varchar(128);
ALTER TABLE "email_notification_jobs" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;
ALTER TABLE "email_notification_jobs" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;
ALTER TABLE "email_notification_jobs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_email_jobs_eligibility" ON "email_notification_jobs" ("status", "next_retry_at", "lease_expires_at");
