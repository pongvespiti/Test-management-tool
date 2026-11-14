-- Test stands of the lab (shared by all projects): zones, stands, bookings and install /
-- uninstall requests to technicians; technician accounts; lab-wide notifications.
ALTER TYPE "notification_kind" ADD VALUE 'stand_request';
ALTER TYPE "notification_kind" ADD VALUE 'stand_request_update';

ALTER TABLE "users" ADD COLUMN "is_technician" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "notifications" ALTER COLUMN "project_id" DROP NOT NULL;

CREATE TYPE "stand_request_kind" AS ENUM ('install', 'uninstall', 'replace');
CREATE TYPE "stand_request_status" AS ENUM ('requested', 'accepted', 'rejected', 'done', 'cancelled');

CREATE TABLE "stand_zones" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stand_zones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stand_zones_name_key" ON "stand_zones"("name");

CREATE TABLE "stands" (
    "id" SERIAL NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "current_model" TEXT,
    "in_charge" TEXT,
    "note" TEXT,
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stands_code_key" ON "stands"("code");
CREATE INDEX "stands_zone_id_sort_order_idx" ON "stands"("zone_id", "sort_order");

CREATE TABLE "stand_bookings" (
    "id" SERIAL NOT NULL,
    "stand_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "note" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stand_bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stand_bookings_dates" CHECK ("end_date" >= "start_date")
);
CREATE INDEX "stand_bookings_stand_id_start_date_idx" ON "stand_bookings"("stand_id", "start_date");
CREATE INDEX "stand_bookings_project_id_idx" ON "stand_bookings"("project_id");

CREATE TABLE "stand_requests" (
    "id" SERIAL NOT NULL,
    "stand_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "kind" "stand_request_kind" NOT NULL,
    "model" TEXT,
    "technician_id" INTEGER NOT NULL,
    "requested_by_id" INTEGER NOT NULL,
    "requested_date" DATE NOT NULL,
    "scheduled_date" DATE,
    "status" "stand_request_status" NOT NULL DEFAULT 'requested',
    "note" TEXT,
    "technician_note" TEXT,
    "done_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stand_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stand_requests_technician_id_status_idx" ON "stand_requests"("technician_id", "status");
CREATE INDEX "stand_requests_stand_id_status_idx" ON "stand_requests"("stand_id", "status");
CREATE INDEX "stand_requests_requested_by_id_idx" ON "stand_requests"("requested_by_id");

ALTER TABLE "stands" ADD CONSTRAINT "stands_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "stand_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stands" ADD CONSTRAINT "stands_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stand_bookings" ADD CONSTRAINT "stand_bookings_stand_id_fkey" FOREIGN KEY ("stand_id") REFERENCES "stands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stand_bookings" ADD CONSTRAINT "stand_bookings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stand_bookings" ADD CONSTRAINT "stand_bookings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stand_requests" ADD CONSTRAINT "stand_requests_stand_id_fkey" FOREIGN KEY ("stand_id") REFERENCES "stands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stand_requests" ADD CONSTRAINT "stand_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stand_requests" ADD CONSTRAINT "stand_requests_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stand_requests" ADD CONSTRAINT "stand_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
