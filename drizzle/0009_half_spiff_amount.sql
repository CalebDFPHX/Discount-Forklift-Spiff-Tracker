ALTER TABLE "public"."spiff_submissions"
  ADD COLUMN IF NOT EXISTS "is_half_spiff_amount" boolean DEFAULT false NOT NULL;
