-- Exploratory sessions: charter, owner, time box, notes timeline and linked defects.
CREATE TYPE "session_status" AS ENUM ('planned', 'in_progress', 'completed');
CREATE TYPE "session_note_kind" AS ENUM ('note', 'bug', 'question', 'idea');

ALTER TABLE "projects" ADD COLUMN "next_session_seq" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "exploratory_sessions" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "charter" TEXT,
    "owner_id" INTEGER,
    "release_id" INTEGER,
    "build_id" INTEGER,
    "environment" JSONB NOT NULL DEFAULT '[]',
    "time_box_minutes" INTEGER,
    "status" "session_status" NOT NULL DEFAULT 'planned',
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "refs" TEXT,
    "summary" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exploratory_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exploratory_notes" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "kind" "session_note_kind" NOT NULL DEFAULT 'note',
    "body" TEXT NOT NULL,
    "author_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exploratory_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exploratory_defects" (
    "session_id" INTEGER NOT NULL,
    "defect_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exploratory_defects_pkey" PRIMARY KEY ("session_id", "defect_id")
);

CREATE UNIQUE INDEX "exploratory_sessions_project_id_seq_key" ON "exploratory_sessions"("project_id", "seq");
CREATE INDEX "exploratory_sessions_project_id_status_idx" ON "exploratory_sessions"("project_id", "status");
CREATE INDEX "exploratory_sessions_build_id_idx" ON "exploratory_sessions"("build_id");
CREATE INDEX "exploratory_notes_session_id_created_at_idx" ON "exploratory_notes"("session_id", "created_at");
CREATE INDEX "exploratory_defects_defect_id_idx" ON "exploratory_defects"("defect_id");

ALTER TABLE "exploratory_sessions" ADD CONSTRAINT "exploratory_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exploratory_sessions" ADD CONSTRAINT "exploratory_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exploratory_sessions" ADD CONSTRAINT "exploratory_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exploratory_sessions" ADD CONSTRAINT "exploratory_sessions_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exploratory_sessions" ADD CONSTRAINT "exploratory_sessions_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exploratory_notes" ADD CONSTRAINT "exploratory_notes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exploratory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exploratory_notes" ADD CONSTRAINT "exploratory_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exploratory_defects" ADD CONSTRAINT "exploratory_defects_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exploratory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exploratory_defects" ADD CONSTRAINT "exploratory_defects_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "defects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
