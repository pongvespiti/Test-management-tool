-- Requirement text changes that need the linked cases to be looked at again.
ALTER TABLE "requirements" ADD COLUMN "text_changed_at" TIMESTAMPTZ(6);
ALTER TABLE "requirements" ADD COLUMN "reviewed_at" TIMESTAMPTZ(6);
ALTER TABLE "requirements" ADD COLUMN "reviewed_by_id" INTEGER;
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
