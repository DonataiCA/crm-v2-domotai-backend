-- Project links (pinned URLs on a project) and task deliverables (checklist items on a
-- project task). Production already has both tables — they were created with `prisma db push`
-- from a machine whose commits never reached the repo — so everything here is guarded to be
-- a no-op where the objects exist and a full create everywhere else.

CREATE TABLE IF NOT EXISTS "project_links" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "task_deliverables" (
    "id" TEXT NOT NULL,
    "projectTaskId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_deliverables_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_links_projectId_idx" ON "project_links"("projectId");
CREATE INDEX IF NOT EXISTS "project_links_organizationId_idx" ON "project_links"("organizationId");
CREATE INDEX IF NOT EXISTS "task_deliverables_projectTaskId_idx" ON "task_deliverables"("projectTaskId");
CREATE INDEX IF NOT EXISTS "task_deliverables_organizationId_idx" ON "task_deliverables"("organizationId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_links_projectId_fkey') THEN
        ALTER TABLE "project_links" ADD CONSTRAINT "project_links_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_links_organizationId_fkey') THEN
        ALTER TABLE "project_links" ADD CONSTRAINT "project_links_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_deliverables_projectTaskId_fkey') THEN
        ALTER TABLE "task_deliverables" ADD CONSTRAINT "task_deliverables_projectTaskId_fkey"
            FOREIGN KEY ("projectTaskId") REFERENCES "project_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_deliverables_organizationId_fkey') THEN
        ALTER TABLE "task_deliverables" ADD CONSTRAINT "task_deliverables_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
