/**
 * Backfill de catálogos — idempotente.
 *
 * Uso:
 *   npx tsx prisma/backfill-catalogs.ts --dry-run          (no escribe nada)
 *   npx tsx prisma/backfill-catalogs.ts                    (aplica)
 *   npx tsx prisma/backfill-catalogs.ts --only=projects
 *
 * Correrlo dos veces seguidas deja la base igual: la segunda pasada no
 * encuentra nada que cambiar. Sale con 1 si alguna fila no se pudo mapear a un
 * valor canónico — esas filas se listan y se resuelven a mano, nunca a ojo.
 */
import { PrismaClient } from '@prisma/client';
import { normalizeProjectStatus } from '../src/constants/enums';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];

function shouldRun(name: string): boolean {
    return !ONLY || ONLY === name;
}

async function backfillProjects(): Promise<number> {
    const projects = await prisma.project.findMany({
        select: { id: true, name: true, status: true },
    });

    let changed = 0;
    const unmapped: Array<{ id: string; name: string; status: string }> = [];

    for (const project of projects) {
        if (!project.status) continue;

        const canonical = normalizeProjectStatus(project.status);

        if (canonical === null) {
            unmapped.push({ id: project.id, name: project.name, status: project.status });
            continue;
        }
        if (canonical === project.status) continue;

        console.log(`  ${project.name}: '${project.status}' → '${canonical}'`);
        if (!DRY_RUN) {
            await prisma.project.update({ where: { id: project.id }, data: { status: canonical } });
        }
        changed++;
    }

    console.log(`\nprojects.status: ${changed} fila(s) ${DRY_RUN ? 'a cambiar' : 'cambiadas'}.`);

    if (unmapped.length > 0) {
        console.error(`\n❌ ${unmapped.length} proyecto(s) con un estado que no se puede mapear:`);
        console.table(unmapped);
    }

    return unmapped.length;
}

async function main() {
    console.log(DRY_RUN ? '── DRY RUN: no se escribe nada ──\n' : '── APLICANDO ──\n');

    let unmapped = 0;
    if (shouldRun('projects')) unmapped += await backfillProjects();

    if (unmapped > 0) {
        console.error(`\n❌ ${unmapped} fila(s) sin mapear. Resolver a mano antes de aplicar los CHECK.`);
        process.exit(1);
    }
    console.log('\n✅ Sin filas pendientes.');
    process.exit(0);
}

main()
    .catch((e) => { console.error(e); process.exit(2); })
    .finally(() => prisma.$disconnect());
