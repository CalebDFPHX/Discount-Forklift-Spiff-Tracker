CREATE TABLE "admin_auth_tokens" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"admin_id" varchar(64) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"token_type" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(255),
	CONSTRAINT "admin_auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_auth_tokens" ADD CONSTRAINT "admin_auth_tokens_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auth_tokens_admin" ON "admin_auth_tokens" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_auth_tokens_hash" ON "admin_auth_tokens" USING btree ("token_hash");