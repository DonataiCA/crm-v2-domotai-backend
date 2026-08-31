-- Add completion percentage (0-100) to project tasks
ALTER TABLE "project_tasks" ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;

-- Backfill: completed tasks are 100%
UPDATE "project_tasks" SET "progress" = 100 WHERE "status" = 'COMPLETED';
