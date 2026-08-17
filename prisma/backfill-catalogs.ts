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
import { normalizeProjectStatus, slugifyStage } from '../src/constants/enums';

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

/**
 * `Lead.stage` guardaba el `name` de la etapa ('Negociación') donde debía ir el
 * `slug` ('negociacion'). El mapeo se hace **dentro del pipeline del lead**:
 * dos organizaciones pueden tener un slug idéntico apuntando a etapas distintas.
 *
 * Se resuelve primero por slug exacto (fila ya correcta), después por
 * `slugifyStage(name)` y por último por `slugifyStage` del propio valor. Lo que
 * no case queda listado y sin tocar.
 */
async function backfillLeadStages(): Promise<number> {
    const leads = await prisma.lead.findMany({
        select: {
            id: true, name: true, stage: true, pipelineId: true,
            pipeline: { select: { id: true, stages: { select: { slug: true, name: true } } } },
        },
    });

    let changed = 0;
    const unmapped: Array<{ id: string; lead: string; stage: string; motivo: string }> = [];

    for (const lead of leads) {
        if (!lead.stage) continue;

        if (!lead.pipeline) {
            unmapped.push({ id: lead.id, lead: lead.name ?? '', stage: lead.stage, motivo: 'sin pipeline' });
            continue;
        }

        const stages = lead.pipeline.stages;
        const target =
            stages.find((s) => s.slug === lead.stage) ??
            stages.find((s) => slugifyStage(s.name) === slugifyStage(lead.stage)) ??
            stages.find((s) => s.slug === slugifyStage(lead.stage));

        if (!target) {
            unmapped.push({ id: lead.id, lead: lead.name ?? '', stage: lead.stage, motivo: 'sin etapa equivalente en su pipeline' });
            continue;
        }
        if (target.slug === lead.stage) continue;

        console.log(`  ${lead.name}: '${lead.stage}' → '${target.slug}'`);
        if (!DRY_RUN) {
            await prisma.lead.update({ where: { id: lead.id }, data: { stage: target.slug } });
        }
        changed++;
    }

    console.log(`\nleads.stage: ${changed} fila(s) ${DRY_RUN ? 'a cambiar' : 'cambiadas'}.`);
    if (unmapped.length > 0) {
        console.error(`\n❌ ${unmapped.length} lead(s) sin mapear:`);
        console.table(unmapped);
    }
    return unmapped.length;
}

/** Mismo criterio, sobre el historial: cada fila se mapea por el pipeline de su lead. */
async function backfillStageHistory(): Promise<number> {
    const entries = await prisma.leadStageHistory.findMany({
        select: {
            id: true, stage: true,
            lead: { select: { pipeline: { select: { stages: { select: { slug: true, name: true } } } } } },
        },
    });

    let changed = 0;
    const unmapped: Array<{ id: string; stage: string }> = [];

    for (const entry of entries) {
        const stages = entry.lead?.pipeline?.stages ?? [];
        const target =
            stages.find((s) => s.slug === entry.stage) ??
            stages.find((s) => slugifyStage(s.name) === slugifyStage(entry.stage)) ??
            stages.find((s) => s.slug === slugifyStage(entry.stage));

        if (!target) { unmapped.push({ id: entry.id, stage: entry.stage }); continue; }
        if (target.slug === entry.stage) continue;

        console.log(`  historial ${entry.id}: '${entry.stage}' → '${target.slug}'`);
        if (!DRY_RUN) {
            await prisma.leadStageHistory.update({ where: { id: entry.id }, data: { stage: target.slug } });
        }
        changed++;
    }

    console.log(`\nlead_stage_history.stage: ${changed} fila(s) ${DRY_RUN ? 'a cambiar' : 'cambiadas'}.`);
    if (unmapped.length > 0) {
        console.error(`\n❌ ${unmapped.length} fila(s) de historial sin mapear:`);
        console.table(unmapped);
    }
    return unmapped.length;
}

async function main() {
    console.log(DRY_RUN ? '── DRY RUN: no se escribe nada ──\n' : '── APLICANDO ──\n');

    let unmapped = 0;
    if (shouldRun('projects')) unmapped += await backfillProjects();
    if (shouldRun('leads')) {
        unmapped += await backfillLeadStages();
        unmapped += await backfillStageHistory();
    }

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
