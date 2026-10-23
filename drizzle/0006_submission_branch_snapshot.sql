ALTER TABLE "spiff_submissions"
ADD COLUMN "branch_id" varchar(64) REFERENCES "branches"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "spiff_submissions"
ADD COLUMN "snapshot_branch_name" varchar(128);
