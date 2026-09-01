-- AlterTable
ALTER TABLE "project_tasks" ADD COLUMN     "dueReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "endReminderSentAt" TIMESTAMP(3);
