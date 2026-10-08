CREATE TABLE "admin_users" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"role" varchar(64) DEFAULT 'Administrator' NOT NULL,
	"password_hash" text,
	"is_authorized" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"submission_id" varchar(64),
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"upload_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"submission_id" varchar(64) NOT NULL,
	"action" varchar(64) NOT NULL,
	"performed_by" varchar(255) NOT NULL,
	"field_changed" varchar(128),
	"old_value" text,
	"new_value" text,
	"explanation" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"code" varchar(32),
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "email_notification_jobs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"submission_id" varchar(64) NOT NULL,
	"job_type" varchar(32) DEFAULT 'submission_alert' NOT NULL,
	"recipient_email" varchar(255) NOT NULL,
	"recipient_name" varchar(255),
	"recipient_role" varchar(64),
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"error_message" text,
	"provider_message_id" varchar(255),
	"idempotency_key" varchar(128) NOT NULL,
	"template_id" varchar(64),
	"template_version" integer,
	"rendered_subject" text,
	"rendered_body_html" text,
	"event_payload" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_notification_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "email_template_versions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"template_id" varchar(64) NOT NULL,
	"version" integer NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body_html" text NOT NULL,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"subject" varchar(255) NOT NULL,
	"body_html" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(255) DEFAULT 'Administrator' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_contacts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(64) NOT NULL,
	"branch" varchar(128),
	"is_default_accounting" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_reps" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"branch" varchar(128),
	"assigned_gm_ids" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spiff_submissions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"idempotency_key" varchar(128),
	"rep_id" varchar(64) NOT NULL,
	"spiff_id" varchar(64) NOT NULL,
	"lift_name" varchar(255) NOT NULL,
	"serial_suffix" varchar(4) NOT NULL,
	"sale_date" date NOT NULL,
	"notes" text,
	"status" varchar(32) DEFAULT 'Pending' NOT NULL,
	"snapshot_rep_name" varchar(255) NOT NULL,
	"snapshot_rep_email" varchar(255),
	"snapshot_spiff_name" varchar(255) NOT NULL,
	"snapshot_eligibility_requirements" text NOT NULL,
	"snapshot_amount_cents" integer NOT NULL,
	"is_potential_duplicate" boolean DEFAULT false NOT NULL,
	"duplicate_reason" text,
	"decision_message" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" varchar(255),
	"rejected_at" timestamp with time zone,
	"rejected_by" varchar(255),
	"rejection_reason" text,
	"paid_at" timestamp with time zone,
	"paid_by" varchar(255),
	CONSTRAINT "spiff_submissions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "spiffs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"eligibility_requirements" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_submission_id_spiff_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."spiff_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_submission_id_spiff_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."spiff_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_jobs" ADD CONSTRAINT "email_notification_jobs_submission_id_spiff_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."spiff_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_template_versions" ADD CONSTRAINT "email_template_versions_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spiff_submissions" ADD CONSTRAINT "spiff_submissions_rep_id_sales_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spiff_submissions" ADD CONSTRAINT "spiff_submissions_spiff_id_spiffs_id_fk" FOREIGN KEY ("spiff_id") REFERENCES "public"."spiffs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attachments_submission" ON "attachments" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_status" ON "attachments" USING btree ("upload_status");--> statement-breakpoint
CREATE INDEX "idx_attachments_uploaded_at" ON "attachments" USING btree ("uploaded_at");--> statement-breakpoint
CREATE INDEX "idx_audit_submission" ON "audit_events" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_audit_timestamp" ON "audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_email_jobs_submission" ON "email_notification_jobs" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_email_jobs_status" ON "email_notification_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_email_jobs_idempotency" ON "email_notification_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_template_versions_template" ON "email_template_versions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_template_versions_created_at" ON "email_template_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_submissions_rep" ON "spiff_submissions" USING btree ("rep_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_status" ON "spiff_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_submissions_submitted_at" ON "spiff_submissions" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "idx_submissions_approved_at" ON "spiff_submissions" USING btree ("approved_at");--> statement-breakpoint
CREATE INDEX "idx_submissions_sale_date" ON "spiff_submissions" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "idx_submissions_serial" ON "spiff_submissions" USING btree ("serial_suffix");