-- Hourly stand bookings with the person who tests, the history of the units on the stands, and
-- notifications stored as message keys so each user reads them in their own language.
ALTER TABLE "stand_bookings" ADD COLUMN "start_minute" INTEGER;
ALTER TABLE "stand_bookings" ADD COLUMN "end_minute" INTEGER;
ALTER TABLE "stand_bookings" ADD COLUMN "tester_id" INTEGER;
ALTER TABLE "stand_bookings" ADD CONSTRAINT "stand_bookings_minutes" CHECK (
    ("start_minute" IS NULL OR ("start_minute" >= 0 AND "start_minute" < 1440)) AND
    ("end_minute" IS NULL OR ("end_minute" > 0 AND "end_minute" <= 1440))
);
ALTER TABLE "stand_bookings" ADD CONSTRAINT "stand_bookings_tester_id_fkey" FOREIGN KEY ("tester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "stand_bookings" SET "tester_id" = "created_by_id";

ALTER TABLE "notifications" ADD COLUMN "message" JSONB;

CREATE TYPE "stand_event_source" AS ENUM ('request', 'manual', 'import');

CREATE TABLE "stand_events" (
    "id" SERIAL NOT NULL,
    "stand_id" INTEGER,
    "stand_code" TEXT NOT NULL,
    "zone_name" TEXT NOT NULL,
    "kind" "stand_request_kind" NOT NULL,
    "source" "stand_event_source" NOT NULL,
    "model_before" TEXT,
    "model_after" TEXT,
    "project_id" INTEGER,
    "project_key" TEXT,
    "request_id" INTEGER,
    "actor_id" INTEGER NOT NULL,
    "note" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stand_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stand_events_at_idx" ON "stand_events"("at");
CREATE INDEX "stand_events_actor_id_at_idx" ON "stand_events"("actor_id", "at");
CREATE INDEX "stand_events_stand_id_at_idx" ON "stand_events"("stand_id", "at");

ALTER TABLE "stand_events" ADD CONSTRAINT "stand_events_stand_id_fkey" FOREIGN KEY ("stand_id") REFERENCES "stands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stand_events" ADD CONSTRAINT "stand_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stand_events" ADD CONSTRAINT "stand_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "stand_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stand_events" ADD CONSTRAINT "stand_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Requests already done become the first history entries.
INSERT INTO "stand_events" ("stand_id", "stand_code", "zone_name", "kind", "source", "model_after",
    "project_id", "project_key", "request_id", "actor_id", "note", "at")
SELECT r."stand_id", s."code", z."name", r."kind", 'request', r."model", r."project_id", p."key",
    r."id", r."technician_id", r."technician_note", COALESCE(r."done_at", r."updated_at")
FROM "stand_requests" r
JOIN "stands" s ON s."id" = r."stand_id"
JOIN "stand_zones" z ON z."id" = s."zone_id"
LEFT JOIN "projects" p ON p."id" = r."project_id"
WHERE r."status" = 'done';
