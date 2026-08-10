-- AlterTable
ALTER TABLE "project_phases" ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable
ALTER TABLE "project_tasks" ALTER COLUMN "status" SET DEFAULT 'TODO',
ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'TODO',
ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';

-- CreateTable
CREATE TABLE "monitor_events" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitor_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_checks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseTimeMs" INTEGER,
    "isUp" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monitor_events_projectId_type_receivedAt_idx" ON "monitor_events"("projectId", "type", "receivedAt");

-- CreateIndex
CREATE INDEX "health_checks_projectId_checkedAt_idx" ON "health_checks"("projectId", "checkedAt");

-- AddForeignKey
ALTER TABLE "monitor_events" ADD CONSTRAINT "monitor_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_checks" ADD CONSTRAINT "health_checks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
