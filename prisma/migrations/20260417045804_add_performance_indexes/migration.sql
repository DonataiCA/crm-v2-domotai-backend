-- CreateIndex
CREATE INDEX "contacts_organizationId_deletedAt_idx" ON "contacts"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "leads_organizationId_stage_idx" ON "leads"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "leads_pipelineId_idx" ON "leads"("pipelineId");

-- CreateIndex
CREATE INDEX "project_tasks_projectId_status_idx" ON "project_tasks"("projectId", "status");

-- CreateIndex
CREATE INDEX "tasks_organizationId_status_idx" ON "tasks"("organizationId", "status");
