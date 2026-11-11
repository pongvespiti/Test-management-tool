-- Saved ways of looking at the summary report (rows, columns, filters).
CREATE TABLE "saved_views" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_views_project_id_idx" ON "saved_views"("project_id");
CREATE UNIQUE INDEX "saved_views_project_id_user_id_name_key" ON "saved_views"("project_id", "user_id", "name");

ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
