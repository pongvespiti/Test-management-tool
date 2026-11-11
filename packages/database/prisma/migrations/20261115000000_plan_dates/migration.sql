-- Planned first and last day of testing of a plan (release schedule).
ALTER TABLE "test_plans" ADD COLUMN "start_date" DATE, ADD COLUMN "due_date" DATE;
