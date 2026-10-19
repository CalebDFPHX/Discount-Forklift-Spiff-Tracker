ALTER TABLE "email_notification_jobs"
ADD COLUMN IF NOT EXISTS "provider_response" text;
