CREATE TABLE "weekly_spiff_report_test_sends" (
  "id" varchar(64) PRIMARY KEY,
  "week_start" date NOT NULL,
  "admin_email" varchar(255) NOT NULL,
  "recipient_email" varchar(255) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'processing',
  "provider_message_id" varchar(255),
  "error_message" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_weekly_spiff_report_test_sends_created_at"
  ON "weekly_spiff_report_test_sends" ("created_at");
