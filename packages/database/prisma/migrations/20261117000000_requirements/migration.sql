-- Requirements table (Excel / Jira / typed in) and explicit links to test cases.
CREATE TYPE "requirement_source" AS ENUM ('manual', 'excel', 'jira');

CREATE TABLE "requirements" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" "requirement_source" NOT NULL DEFAULT 'manual',
    "source_ref" TEXT,
    "external_url" TEXT,
    "external_status" TEXT,
    "synced_at" TIMESTAMPTZ(6),
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "requirement_cases" (
    "requirement_id" INTEGER NOT NULL,
    "test_case_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_cases_pkey" PRIMARY KEY ("requirement_id", "test_case_id")
);

CREATE UNIQUE INDEX "requirements_project_id_key_key" ON "requirements"("project_id", "key");
-- Keys are compared without regard to case ("sec 3" and "SEC 3" are one requirement).
CREATE UNIQUE INDEX "requirements_project_id_lower_key_key" ON "requirements"("project_id", lower("key"));
CREATE INDEX "requirements_project_id_source_idx" ON "requirements"("project_id", "source");
CREATE INDEX "requirement_cases_test_case_id_idx" ON "requirement_cases"("test_case_id");

ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "requirement_cases" ADD CONSTRAINT "requirement_cases_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "requirement_cases" ADD CONSTRAINT "requirement_cases_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
