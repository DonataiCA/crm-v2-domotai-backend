-- AlterTable
ALTER TABLE "task_comments" ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
