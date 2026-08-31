-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "dueReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
