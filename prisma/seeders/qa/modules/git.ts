import { PrismaClient } from '@prisma/client';
import { qaId, daysAgo } from '../ids';
import { ORG_A, P_ADMIN } from '../core';
import { PR_PORTAL } from './projects';

/**
 * Integración con GitHub. Dos repositorios en el mismo proyecto, que es el
 * caso que la auditoría marcó como fácil de olvidar: no se puede asumir
 * un repo por proyecto.
 *
 * Los datos son sintéticos: no se llama a la API de GitHub, así que sirve
 * para probar la visualización sin necesitar un token.
 */
export const REPO_BACK = qaId('repo:backend');
export const REPO_FRONT = qaId('repo:frontend');

export async function seedGit(prisma: PrismaClient): Promise<string> {
    const repos = [
        { id: REPO_BACK, label: 'Backend', githubOwner: 'domotai', repositoryName: 'portal-andina-api', defaultBranch: 'main' },
        { id: REPO_FRONT, label: 'Frontend', githubOwner: 'domotai', repositoryName: 'portal-andina-web', defaultBranch: 'main' },
    ];

    for (const r of repos) {
        await prisma.projectRepo.upsert({
            where: { id: r.id },
            update: { label: r.label },
            create: {
                ...r, projectId: PR_PORTAL, organizationId: ORG_A,
                repositoryUrl: `https://github.com/${r.githubOwner}/${r.repositoryName}`,
                lastGitSyncAt: daysAgo(1),
            },
        });
    }

    // ── Métricas por rama ───────────────────────────────────────────────────
    const ramas = [
        { repo: REPO_BACK, branch: 'main', commits: 184, prs: 3, open: 7, closed: 42, autor: 'Fabián Freelance', msg: 'fix: valida el token de refresh antes de rotarlo', dias: 1 },
        { repo: REPO_BACK, branch: 'develop', commits: 61, prs: 2, open: 7, closed: 42, autor: 'Fabián Freelance', msg: 'feat: endpoint de avance por fase', dias: 0 },
        { repo: REPO_FRONT, branch: 'main', commits: 233, prs: 1, open: 4, closed: 31, autor: 'Alicia Admin', msg: 'chore: sube la versión a 1.4.2', dias: 2 },
        { repo: REPO_FRONT, branch: 'feature/tablero', branchCommits: 18, commits: 18, prs: 1, open: 4, closed: 31, autor: 'Fabián Freelance', msg: 'wip: tablero de avance de obra', dias: 0 },
    ];

    for (let i = 0; i < ramas.length; i++) {
        const r = ramas[i];
        await prisma.gitMetric.upsert({
            where: { projectRepoId_branchName: { projectRepoId: r.repo, branchName: r.branch } },
            update: { commitsCount: r.commits, lastCommitDate: daysAgo(r.dias) },
            create: {
                id: qaId(`git-metric:${i}`), projectId: PR_PORTAL, projectRepoId: r.repo,
                organizationId: ORG_A, branchName: r.branch, commitsCount: r.commits,
                lastCommitSha: qaId(`sha:${i}`).replace(/-/g, '').substring(0, 40),
                lastCommitDate: daysAgo(r.dias), lastCommitMessage: r.msg, lastCommitAuthor: r.autor,
                pullRequestsCount: r.prs, openIssuesCount: r.open, closedIssuesCount: r.closed,
            },
        });
    }

    // ── Commits ─────────────────────────────────────────────────────────────
    const mensajes = [
        'feat: endpoint de avance por fase', 'fix: valida el token de refresh antes de rotarlo',
        'refactor: extrae el cálculo de utilización a un helper', 'test: cubre el caso de tarea sin fase',
        'chore: actualiza dependencias con vulnerabilidades', 'feat: filtro por etiqueta en el tablero',
        'fix: corrige el huso horario en los vencimientos', 'docs: documenta la ingesta del monitor',
        'perf: evita el N+1 al listar comisiones', 'style: unifica el espaciado de las tarjetas',
        'feat: exporta el informe de antigüedad a CSV', 'fix: el kanban perdía el orden al arrastrar',
    ];
    const autores = ['Fabián Freelance', 'Alicia Admin', 'Sergio Comercial'];

    let total = 0;
    for (const repoId of [REPO_BACK, REPO_FRONT]) {
        const rama = repoId === REPO_BACK ? 'main' : 'main';
        for (let i = 0; i < mensajes.length; i++) {
            const key = `${repoId === REPO_BACK ? 'b' : 'f'}${i}`;
            const sha = qaId(`commit-sha:${key}`).replace(/-/g, '').substring(0, 40);
            await prisma.gitCommit.upsert({
                where: { projectRepoId_commitSha: { projectRepoId: repoId, commitSha: sha } },
                update: {},
                create: {
                    id: qaId(`commit:${key}`), projectId: PR_PORTAL, projectRepoId: repoId,
                    organizationId: ORG_A, commitSha: sha,
                    commitMessage: mensajes[i], commitAuthor: autores[i % autores.length],
                    commitDate: daysAgo(i + 1), branchName: rama,
                    filesChanged: 1 + (i % 9), additions: 12 + i * 7, deletions: 3 + i * 2,
                    repositoryUrl: `https://github.com/domotai/${repoId === REPO_BACK ? 'portal-andina-api' : 'portal-andina-web'}`,
                },
            });
            total++;
        }
    }

    return `${repos.length} repos en un mismo proyecto · ${ramas.length} ramas con métricas · ${total} commits`;
}
