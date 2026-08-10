-- Step 1: Create project_repos table
CREATE TABLE "project_repos" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT,
    "githubOwner" TEXT NOT NULL,
    "repositoryName" TEXT NOT NULL,
    "repositoryUrl" TEXT,
    "defaultBranch" TEXT DEFAULT 'main',
    "lastGitSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_repos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_repos_projectId_githubOwner_repositoryName_key" ON "project_repos"("projectId", "githubOwner", "repositoryName");
CREATE INDEX "project_repos_projectId_idx" ON "project_repos"("projectId");

ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 2: Add nullable projectRepoId to git_metrics and git_commits
ALTER TABLE "git_metrics" ADD COLUMN "projectRepoId" TEXT;
ALTER TABLE "git_commits" ADD COLUMN "projectRepoId" TEXT;

-- Step 3: Backfill — for each project with githubOwner+repositoryName, create a ProjectRepo
INSERT INTO "project_repos" ("id", "projectId", "organizationId", "githubOwner", "repositoryName", "repositoryUrl", "defaultBranch", "lastGitSyncAt", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    p."id",
    p."organizationId",
    p."githubOwner",
    p."repositoryName",
    p."repositoryUrl",
    COALESCE(p."defaultBranch", 'main'),
    p."lastGitSyncAt",
    NOW(),
    NOW()
FROM "projects" p
WHERE p."githubOwner" IS NOT NULL AND p."repositoryName" IS NOT NULL;

-- Step 4: Link existing git_metrics rows to their newly-created ProjectRepo
UPDATE "git_metrics" gm
SET "projectRepoId" = pr."id"
FROM "project_repos" pr
WHERE gm."projectId" = pr."projectId"
  AND gm."projectRepoId" IS NULL;

-- Step 5: Link existing git_commits rows to their newly-created ProjectRepo
UPDATE "git_commits" gc
SET "projectRepoId" = pr."id"
FROM "project_repos" pr
WHERE gc."projectId" = pr."projectId"
  AND gc."projectRepoId" IS NULL;

-- Step 6: Drop old uniques (only-projectId-based) and add new uniques (projectRepoId-based)
DROP INDEX IF EXISTS "git_metrics_projectId_branchName_key";
DROP INDEX IF EXISTS "git_commits_projectId_commitSha_key";

CREATE UNIQUE INDEX "git_metrics_projectRepoId_branchName_key" ON "git_metrics"("projectRepoId", "branchName");
CREATE UNIQUE INDEX "git_commits_projectRepoId_commitSha_key" ON "git_commits"("projectRepoId", "commitSha");

-- Re-add the projectId index that may have been dropped with the unique
CREATE INDEX IF NOT EXISTS "git_metrics_projectId_idx" ON "git_metrics"("projectId");

-- Step 7: Add FKs from git_metrics/git_commits to project_repos
ALTER TABLE "git_metrics" ADD CONSTRAINT "git_metrics_projectRepoId_fkey" FOREIGN KEY ("projectRepoId") REFERENCES "project_repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "git_commits" ADD CONSTRAINT "git_commits_projectRepoId_fkey" FOREIGN KEY ("projectRepoId") REFERENCES "project_repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
