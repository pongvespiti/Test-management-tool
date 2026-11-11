-- Builds of a release; runs and defects can point at them.
CREATE TABLE "builds" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "built_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "builds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "builds_release_id_name_key" ON "builds"("release_id", "name");

ALTER TABLE "test_runs" ADD COLUMN "build_id" INTEGER;
ALTER TABLE "defects" ADD COLUMN "found_in_build_id" INTEGER, ADD COLUMN "fixed_in_build_id" INTEGER;

CREATE INDEX "test_runs_build_id_idx" ON "test_runs"("build_id");

ALTER TABLE "builds" ADD CONSTRAINT "builds_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "defects" ADD CONSTRAINT "defects_found_in_build_id_fkey" FOREIGN KEY ("found_in_build_id") REFERENCES "builds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "defects" ADD CONSTRAINT "defects_fixed_in_build_id_fkey" FOREIGN KEY ("fixed_in_build_id") REFERENCES "builds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
