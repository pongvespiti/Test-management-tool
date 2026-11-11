-- Deadline of a run, and the topic a suite belongs to (several suites, one per unit model, share a topic).
ALTER TABLE "test_runs" ADD COLUMN "due_date" DATE;
ALTER TABLE "suites" ADD COLUMN "topic" TEXT;
