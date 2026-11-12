-- Test device registry with the current holder (check-out / return).
CREATE TYPE "device_kind" AS ENUM ('unit', 'phone', 'router', 'other');
CREATE TYPE "device_status" AS ENUM ('available', 'in_use', 'repair');

CREATE TABLE "devices" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "kind" "device_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "serial" TEXT,
    "os_version" TEXT,
    "status" "device_status" NOT NULL DEFAULT 'available',
    "holder_id" INTEGER,
    "held_since" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
    -- A device is held exactly when it is in use.
    CONSTRAINT "devices_holder_matches_status" CHECK (("status" = 'in_use') = ("holder_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "devices_project_id_name_key" ON "devices"("project_id", "name");
CREATE INDEX "devices_project_id_status_idx" ON "devices"("project_id", "status");
CREATE INDEX "devices_holder_id_idx" ON "devices"("holder_id");

ALTER TABLE "devices" ADD CONSTRAINT "devices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
