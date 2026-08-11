/**
 * Seed de QA — orquestador.
 *
 *   npm run seed:qa                   → núcleo + todos los módulos
 *   npm run seed:qa -- leads invoices → solo esos (el núcleo se garantiza antes)
 *   npm run seed:qa -- --reset        → borra lo sembrado por QA y resiembra
 *   npm run seed:qa -- --list         → imprime la leyenda de IDs
 *   npm run seed:qa -- --help
 *
 * Todo es idempotente: cada módulo hace upsert sobre IDs deterministas, así
 * que re-ejecutarlo nunca duplica filas.
 */
import { PrismaClient } from '@prisma/client';
import { legend } from './ids';
import { seedCore, QA_PASSWORD, ORG_A, ORG_B, USERS } from './core';

import { seedCompanies } from './modules/companies';
import { seedContacts } from './modules/contacts';
import { seedLeads } from './modules/leads';
import { seedProjects } from './modules/projects';
import { seedTags } from './modules/tags';
import { seedTasks } from './modules/tasks';
import { seedInvoices } from './modules/invoices';
import { seedTimeEntries } from './modules/time-entries';
import { seedCalendar } from './modules/calendar';
import { seedPortal } from './modules/portal';
import { seedMonitor } from './modules/monitor';
import { seedGit } from './modules/git';
import { seedNotifications } from './modules/notifications';
import { seedAudit } from './modules/audit';

const prisma = new PrismaClient();

interface Module {
    name: string;
    describe: string;
    run: (p: PrismaClient) => Promise<string>;
}

/** El orden importa: cada módulo asume que los anteriores ya existen. */
const MODULES: Module[] = [
    { name: 'companies', describe: 'Empresas', run: seedCompanies },
    { name: 'contacts', describe: 'Contactos, notas y adjuntos', run: seedContacts },
    { name: 'leads', describe: 'Leads, historial de etapas y eventos', run: seedLeads },
    { name: 'projects', describe: 'Proyectos, fases, tareas, equipo e hitos', run: seedProjects },
    { name: 'tags', describe: 'Etiquetas y asignaciones', run: seedTags },
    { name: 'tasks', describe: 'Tareas comerciales, comentarios y enlaces', run: seedTasks },
    { name: 'invoices', describe: 'Facturas y líneas', run: seedInvoices },
    { name: 'time-entries', describe: 'Registro de horas', run: seedTimeEntries },
    { name: 'calendar', describe: 'Eventos de calendario', run: seedCalendar },
    { name: 'portal', describe: 'Enlaces del portal de cliente', run: seedPortal },
    { name: 'monitor', describe: 'Monitoreo: heartbeats, errores y uptime', run: seedMonitor },
    { name: 'git', describe: 'Repositorios, métricas y commits', run: seedGit },
    { name: 'notifications', describe: 'Notificaciones y preferencias', run: seedNotifications },
    { name: 'audit', describe: 'Bitácora de auditoría', run: seedAudit },
];

/**
 * Borra únicamente lo que este seed crea, acotado a las dos organizaciones
 * de QA. Nunca ejecuta un DELETE sin filtro, así que es seguro correrlo en
 * una base que también tenga datos reales.
 */
async function reset(): Promise<void> {
    const orgs = { in: [ORG_A, ORG_B] };
    const profileIds = USERS.map(u => u.profileId);

    // Orden inverso a las dependencias, para no chocar con las claves foráneas.
    await prisma.projectTaskTag.deleteMany({ where: { tag: { organizationId: orgs } } });
    await prisma.taskComment.deleteMany({ where: { organizationId: orgs } });
    await prisma.taskLink.deleteMany({ where: { organizationId: orgs } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { organizationId: orgs } } });
    await prisma.invoice.deleteMany({ where: { organizationId: orgs } });
    await prisma.timeEntry.deleteMany({ where: { organizationId: orgs } });
    await prisma.calendarEvent.deleteMany({ where: { organizationId: orgs } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgs } });
    await prisma.notification.deleteMany({ where: { organizationId: orgs } });
    await prisma.notificationPreference.deleteMany({
        where: { userId: { in: USERS.map(u => u.email) } },
    });
    await prisma.gitCommit.deleteMany({ where: { organizationId: orgs } });
    await prisma.gitMetric.deleteMany({ where: { organizationId: orgs } });
    await prisma.projectRepo.deleteMany({ where: { organizationId: orgs } });
    await prisma.projectShare.deleteMany({ where: { organizationId: orgs } });
    await prisma.healthCheck.deleteMany({ where: { project: { organizationId: orgs } } });
    await prisma.monitorEvent.deleteMany({ where: { project: { organizationId: orgs } } });
    await prisma.projectMilestone.deleteMany({ where: { project: { organizationId: orgs } } });
    await prisma.projectTeamMember.deleteMany({ where: { project: { organizationId: orgs } } });
    await prisma.projectTask.deleteMany({ where: { organizationId: orgs } });
    await prisma.projectPhase.deleteMany({ where: { project: { organizationId: orgs } } });
    await prisma.task.deleteMany({ where: { organizationId: orgs } });
    await prisma.leadStageHistory.deleteMany({ where: { lead: { organizationId: orgs } } });
    await prisma.leadEvent.deleteMany({ where: { organizationId: orgs } });
    await prisma.fileLink.deleteMany({
        where: { OR: [{ lead: { organizationId: orgs } }, { contact: { organizationId: orgs } }, { company: { organizationId: orgs } }] },
    });
    await prisma.lead.deleteMany({ where: { organizationId: orgs } });
    await prisma.project.deleteMany({ where: { organizationId: orgs } });
    await prisma.contactNote.deleteMany({ where: { contact: { organizationId: orgs } } });
    await prisma.contact.deleteMany({ where: { organizationId: orgs } });
    await prisma.company.deleteMany({ where: { organizationId: orgs } });
    await prisma.tag.deleteMany({ where: { organizationId: orgs } });
    await prisma.pipelineStage.deleteMany({ where: { pipeline: { organizationId: orgs } } });
    await prisma.pipeline.deleteMany({ where: { organizationId: orgs } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: orgs } });
    await prisma.profile.deleteMany({ where: { id: { in: profileIds } } });
    await prisma.jWT.deleteMany({ where: { user: { email: { in: USERS.map(u => u.email) } } } });
    await prisma.user.deleteMany({ where: { email: { in: USERS.map(u => u.email) } } });
    await prisma.organization.deleteMany({ where: { id: orgs } });
}

function help(): void {
    console.log(`
Seed de QA para el CRM Domotai

  npm run seed:qa                      Siembra el núcleo y los ${MODULES.length} módulos
  npm run seed:qa -- <módulo>...       Siembra solo los módulos indicados
  npm run seed:qa -- --reset           Borra lo sembrado por QA y vuelve a sembrar
  npm run seed:qa -- --list            Imprime la leyenda de etiqueta → UUID
  npm run seed:qa -- --help            Esta ayuda

Módulos disponibles:
${MODULES.map(m => `  ${m.name.padEnd(14)} ${m.describe}`).join('\n')}
`);
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);

    if (argv.includes('--help') || argv.includes('-h')) { help(); return; }

    const doReset = argv.includes('--reset');
    const doList = argv.includes('--list');
    const selected = argv.filter(a => !a.startsWith('-'));

    const unknown = selected.filter(s => !MODULES.some(m => m.name === s));
    if (unknown.length > 0) {
        console.error(`\nMódulo desconocido: ${unknown.join(', ')}`);
        help();
        process.exitCode = 1;
        return;
    }

    const toRun = selected.length > 0
        ? MODULES.filter(m => selected.includes(m.name))
        : MODULES;

    console.log('\n╭─────────────────────────────────────────────────────────╮');
    console.log('│  SEED DE QA — CRM Domotai                               │');
    console.log('╰─────────────────────────────────────────────────────────╯\n');

    if (doReset) {
        process.stdout.write('  Limpiando datos de QA anteriores... ');
        await reset();
        console.log('hecho\n');
    }

    process.stdout.write('  núcleo         organizaciones, usuarios, pipelines ... ');
    await seedCore(prisma);
    console.log('ok');

    for (const m of toRun) {
        process.stdout.write(`  ${m.name.padEnd(14)} `);
        try {
            const summary = await m.run(prisma);
            console.log(summary);
        } catch (err) {
            console.log('FALLÓ');
            throw err;
        }
    }

    if (doList) {
        console.log('\n─── Leyenda de IDs ───');
        for (const { label, id } of legend()) {
            console.log(`  ${label.padEnd(34)} ${id}`);
        }
    }

    console.log(`
╭─────────────────────────────────────────────────────────╮
│  ACCESO                                                 │
╰─────────────────────────────────────────────────────────╯

  Contraseña para todos:  ${QA_PASSWORD}

${USERS.map(u => `  ${u.email.padEnd(30)} ${u.role}`).join('\n')}

  Organización A (datos):        ${ORG_A}
  Organización B (aislamiento):  ${ORG_B}

  Portal de cliente sin login:
    /portal/qa-portal-activo        activo
    /portal/qa-portal-caducado      caducado  → 410
    /portal/qa-portal-revocado      revocado  → 410
    /portal/qa-portal-solo-lectura  sin permiso de comentar
    /portal/qa-portal-completo      crea y edita tareas
`);
}

main()
    .catch((e) => {
        console.error('\nError durante el seed:\n', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
