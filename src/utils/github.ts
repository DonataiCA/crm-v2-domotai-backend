/**
 * Lightweight GitHub REST API client (no external deps).
 * Uses native fetch (Node 18+).
 */

import { prisma } from '../config/prisma';

const GH_API = 'https://api.github.com';

interface GhCommit {
    sha: string;
    commit: {
        message: string;
        author: { name: string; date: string } | null;
    };
}

interface GhBranch {
    name: string;
    commit: { sha: string };
}

interface GhRepo {
    name: string;
    full_name: string;
    open_issues_count: number;
    default_branch: string;
}

export class GitHubError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'GitHubError';
    }
}

async function ghRequest<T>(path: string, token: string): Promise<T> {
    const res = await fetch(`${GH_API}${path}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        let message = `GitHub API ${res.status}`;
        if (res.status === 404) message = 'Repository not found or token has no access';
        else if (res.status === 401) message = 'Invalid GitHub token';
        else if (res.status === 403) message = `GitHub rate limit or forbidden: ${body.slice(0, 200)}`;
        else message = `GitHub API ${res.status}: ${body.slice(0, 200)}`;
        throw new GitHubError(res.status, message);
    }

    return res.json() as Promise<T>;
}

export async function fetchRepo(owner: string, repo: string, token: string): Promise<GhRepo> {
    return ghRequest<GhRepo>(`/repos/${owner}/${repo}`, token);
}

export async function fetchBranches(owner: string, repo: string, token: string): Promise<GhBranch[]> {
    return ghRequest<GhBranch[]>(`/repos/${owner}/${repo}/branches?per_page=100`, token);
}

export async function fetchOpenPRCount(owner: string, repo: string, token: string): Promise<number> {
    // Use search API to get count without fetching all PRs
    const data = await ghRequest<{ total_count: number }>(
        `/search/issues?q=repo:${owner}/${repo}+type:pr+state:open`,
        token,
    );
    return data.total_count;
}

export async function fetchClosedIssueCount(owner: string, repo: string, token: string): Promise<number> {
    const data = await ghRequest<{ total_count: number }>(
        `/search/issues?q=repo:${owner}/${repo}+type:issue+state:closed`,
        token,
    );
    return data.total_count;
}

export async function fetchBranchCommits(
    owner: string,
    repo: string,
    branch: string,
    token: string,
    since: string,
    perPage = 50,
): Promise<GhCommit[]> {
    return ghRequest<GhCommit[]>(
        `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}&since=${encodeURIComponent(since)}`,
        token,
    );
}

/**
 * Full sync for one project. Returns counts.
 * - Caps: 10 branches, 50 commits per branch, last 90 days
 * - Total API calls: ~3 + (1 per branch) ≈ 13 per project
 */
export interface SyncResult {
    branches: number;
    commitsTotal: number;
    openPRs: number;
    openIssues: number;
    closedIssues: number;
    branchData: Array<{
        name: string;
        commitCount: number;
        latestCommit: GhCommit | null;
        commits: GhCommit[];
    }>;
}

const MAX_BRANCHES = 10;
const COMMITS_PER_BRANCH = 50;
const LOOKBACK_DAYS = 90;

export async function syncRepo(owner: string, repo: string, token: string): Promise<SyncResult> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Fetch repo + branches + counts in parallel
    const [repoData, branchesAll, openPRs, closedIssues] = await Promise.all([
        fetchRepo(owner, repo, token),
        fetchBranches(owner, repo, token),
        fetchOpenPRCount(owner, repo, token).catch(() => 0),
        fetchClosedIssueCount(owner, repo, token).catch(() => 0),
    ]);

    // Sort branches: default branch first, then alphabetical
    const branches = branchesAll
        .sort((a, b) => {
            if (a.name === repoData.default_branch) return -1;
            if (b.name === repoData.default_branch) return 1;
            return a.name.localeCompare(b.name);
        })
        .slice(0, MAX_BRANCHES);

    // Fetch commits for each branch in parallel
    const branchData = await Promise.all(
        branches.map(async (b) => {
            try {
                const commits = await fetchBranchCommits(owner, repo, b.name, token, since, COMMITS_PER_BRANCH);
                return {
                    name: b.name,
                    commitCount: commits.length,
                    latestCommit: commits[0] || null,
                    commits,
                };
            } catch {
                return { name: b.name, commitCount: 0, latestCommit: null, commits: [] as GhCommit[] };
            }
        }),
    );

    const commitsTotal = branchData.reduce((sum, b) => sum + b.commitCount, 0);

    return {
        branches: branches.length,
        commitsTotal,
        openPRs,
        openIssues: repoData.open_issues_count,
        closedIssues,
        branchData,
    };
}

/**
 * Sync a single ProjectRepo: fetch from GitHub and upsert metrics + commits.
 * Updates `lastGitSyncAt` on the repo. Returns counts.
 * Throws GitHubError if the API rejects.
 */
export async function syncOneRepo(
    repo: { id: string; projectId: string; githubOwner: string; repositoryName: string; repositoryUrl: string | null },
    organizationId: string,
): Promise<{ syncedMetrics: number; syncedCommits: number }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN not configured on server');
    }

    const repoUrl = repo.repositoryUrl || `https://github.com/${repo.githubOwner}/${repo.repositoryName}`;
    const result = await syncRepo(repo.githubOwner, repo.repositoryName, token);

    let syncedMetrics = 0;
    let syncedCommits = 0;

    for (const b of result.branchData) {
        await prisma.gitMetric.upsert({
            where: { projectRepoId_branchName: { projectRepoId: repo.id, branchName: b.name } },
            create: {
                projectId: repo.projectId,
                projectRepoId: repo.id,
                organizationId,
                repositoryUrl: repoUrl,
                branchName: b.name,
                commitsCount: b.commitCount,
                lastCommitSha: b.latestCommit?.sha || null,
                lastCommitDate: b.latestCommit?.commit?.author?.date
                    ? new Date(b.latestCommit.commit.author.date)
                    : null,
                lastCommitMessage: b.latestCommit?.commit?.message?.slice(0, 500) || null,
                lastCommitAuthor: b.latestCommit?.commit?.author?.name || null,
                pullRequestsCount: result.openPRs,
                openIssuesCount: result.openIssues,
                closedIssuesCount: result.closedIssues,
            },
            update: {
                repositoryUrl: repoUrl,
                commitsCount: b.commitCount,
                lastCommitSha: b.latestCommit?.sha || null,
                lastCommitDate: b.latestCommit?.commit?.author?.date
                    ? new Date(b.latestCommit.commit.author.date)
                    : null,
                lastCommitMessage: b.latestCommit?.commit?.message?.slice(0, 500) || null,
                lastCommitAuthor: b.latestCommit?.commit?.author?.name || null,
                pullRequestsCount: result.openPRs,
                openIssuesCount: result.openIssues,
                closedIssuesCount: result.closedIssues,
            },
        });
        syncedMetrics++;

        for (const c of b.commits) {
            if (!c.sha || !c.commit?.author?.date) continue;
            await prisma.gitCommit.upsert({
                where: { projectRepoId_commitSha: { projectRepoId: repo.id, commitSha: c.sha } },
                create: {
                    projectId: repo.projectId,
                    projectRepoId: repo.id,
                    organizationId,
                    commitSha: c.sha,
                    commitMessage: c.commit.message?.slice(0, 1000) || '',
                    commitAuthor: c.commit.author.name,
                    commitDate: new Date(c.commit.author.date),
                    branchName: b.name,
                    repositoryUrl: repoUrl,
                },
                update: {
                    commitMessage: c.commit.message?.slice(0, 1000) || '',
                    commitAuthor: c.commit.author.name,
                },
            });
            syncedCommits++;
        }
    }

    await prisma.projectRepo.update({
        where: { id: repo.id },
        data: { lastGitSyncAt: new Date() },
    });

    return { syncedMetrics, syncedCommits };
}
