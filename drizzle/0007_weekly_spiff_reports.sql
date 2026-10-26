CREATE TABLE "weekly_spiff_reports" (
  "week_start" date PRIMARY KEY,
  "status" varchar(32) NOT NULL DEFAULT 'processing',
  "attempt_count" integer NOT NULL DEFAULT 1,
  "provider_message_id" varchar(255),
  "error_message" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
