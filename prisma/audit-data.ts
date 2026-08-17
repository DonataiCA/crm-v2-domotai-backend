/**
 * Auditoría de integridad — SOLO LECTURA. No escribe ni una fila.
 * Uso: npx ts-node prisma/audit-data.ts
 * Sale con 1 si alguna regla tiene violaciones (útil como gate de CI).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Check = { name: string; sql: string };

const CHECKS: Check[] = [
    // --- Catálogos fuera de vocabulario ---
    { name: 'tasks.status fuera de catálogo',
      sql: `SELECT count(*)::int FROM tasks WHERE status IS NOT NULL AND status NOT IN ('TODO','IN_PROGRESS','ON_HOLD','COMPLETED')` },
    { name: 'tasks.priority fuera de catálogo',
      sql: `SELECT count(*)::int FROM tasks WHERE priority IS NOT NULL AND priority NOT IN ('LOW','MEDIUM','HIGH','URGENT')` },
    { name: 'project_tasks.status fuera de catálogo',
      sql: `SELECT count(*)::int FROM project_tasks WHERE status IS NOT NULL AND status NOT IN ('TODO','IN_PROGRESS','ON_HOLD','COMPLETED')` },
    { name: 'project_tasks.priority fuera de catálogo',
      sql: `SELECT count(*)::int FROM project_tasks WHERE priority IS NOT NULL AND priority NOT IN ('LOW','MEDIUM','HIGH','URGENT')` },
    { name: 'projects.status fuera de catálogo',
      sql: `SELECT count(*)::int FROM projects WHERE status IS NOT NULL AND status NOT IN ('NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETED','ARCHIVED')` },
    { name: 'project_phases.status fuera de catálogo',
      sql: `SELECT count(*)::int FROM project_phases WHERE status IS NOT NULL AND status NOT IN ('active','completed','on_hold')` },
    { name: 'invoices.status fuera de catálogo',
      sql: `SELECT count(*)::int FROM invoices WHERE status NOT IN ('DRAFT','SENT','PAID','OVERDUE','CANCELLED')` },
    { name: 'profiles.role fuera de catálogo',
      sql: `SELECT count(*)::int FROM profiles WHERE role NOT IN ('admin','salesman','freelancer','client','viewer')` },
    { name: 'organization_members.role fuera de catálogo',
      sql: `SELECT count(*)::int FROM organization_members WHERE role NOT IN ('admin','member','client')` },
    // Minúscula y con create_task/edit_task: el vocabulario real del portal.
    // Esta regla medía contra VIEW|COMMENT|EDIT, que no era el de la base ni el
    // del código, y por eso marcaba las 6 filas en rojo sin que hubiera nada malo.
    { name: 'project_shares.permissions fuera de catálogo',
      sql: `SELECT count(*)::int FROM project_shares
            WHERE permissions !~ '^(view|comment|create_task|edit_task)(,(view|comment|create_task|edit_task))*$'` },

    // --- Coherencia referencial que la base hoy no exige ---
    { name: 'leads.stage que no es un slug',
      sql: `SELECT count(*)::int FROM leads WHERE stage IS NOT NULL AND stage !~ '^[a-z0-9_]+$'` },
    { name: 'leads.stage sin PipelineStage correspondiente',
      sql: `SELECT count(*)::int FROM leads l WHERE l."pipelineId" IS NOT NULL AND l.stage IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM pipeline_stages s WHERE s."pipelineId" = l."pipelineId" AND s.slug = l.stage)` },
    { name: 'project_tasks cuya fase pertenece a otro proyecto',
      sql: `SELECT count(*)::int FROM project_tasks t JOIN project_phases p ON p.id = t."phaseId" WHERE p."projectId" <> t."projectId"` },
    { name: 'project_tasks cuya organizationId no coincide con la del proyecto',
      sql: `SELECT count(*)::int FROM project_tasks t JOIN projects p ON p.id = t."projectId" WHERE p."organizationId" <> t."organizationId"` },
    { name: 'ai_chat_messages huérfanos (organización inexistente)',
      sql: `SELECT count(*)::int FROM ai_chat_messages m WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = m."organizationId")` },
    { name: 'notification_preferences huérfanas (perfil inexistente)',
      sql: `SELECT count(*)::int FROM notification_preferences n WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = n."userId")` },
    { name: 'notifications.actorId huérfano',
      sql: `SELECT count(*)::int FROM notifications n WHERE n."actorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = n."actorId")` },

    // --- Polimorfismo sin XOR ---
    { name: 'task_comments con ambos padres o ninguno',
      sql: `SELECT count(*)::int FROM task_comments WHERE ("taskId" IS NULL) = ("projectTaskId" IS NULL)` },
    { name: 'task_links con ambos padres o ninguno',
      sql: `SELECT count(*)::int FROM task_links WHERE ("taskId" IS NULL) = ("projectTaskId" IS NULL)` },
    { name: 'email_notifications con ambos padres o ninguno',
      sql: `SELECT count(*)::int FROM email_notifications WHERE ("taskId" IS NULL) = ("projectTaskId" IS NULL)` },
    { name: 'file_links sin exactamente un padre',
      sql: `SELECT count(*)::int FROM file_links WHERE (("contactId" IS NOT NULL)::int + ("leadId" IS NOT NULL)::int + ("companyId" IS NOT NULL)::int) <> 1` },

    // --- Unicidad que falta ---
    { name: 'profiles.email duplicados (case-insensitive)',
      sql: `SELECT coalesce(sum(c - 1), 0)::int FROM (SELECT count(*) AS c FROM profiles GROUP BY lower(trim(email)) HAVING count(*) > 1) x` },
    { name: 'tags con mismo nombre en organizaciones distintas (bloqueadas por el unique global)',
      sql: `SELECT coalesce(sum(c - 1), 0)::int FROM (SELECT count(*) AS c FROM tags GROUP BY "nameLower" HAVING count(DISTINCT "organizationId") > 1) x` },
    { name: 'organizations.slug duplicados',
      sql: `SELECT coalesce(sum(c - 1), 0)::int FROM (SELECT count(*) AS c FROM organizations WHERE slug IS NOT NULL GROUP BY slug HAVING count(*) > 1) x` },
    { name: 'invoices.invoiceNumber duplicados dentro de la organización',
      sql: `SELECT coalesce(sum(c - 1), 0)::int FROM (SELECT count(*) AS c FROM invoices WHERE "invoiceNumber" IS NOT NULL GROUP BY "organizationId", "invoiceNumber" HAVING count(*) > 1) x` },

    // --- Coherencia temporal y de estado ---
    { name: 'project_tasks con dueDate anterior a startDate',
      sql: `SELECT count(*)::int FROM project_tasks WHERE "startDate" IS NOT NULL AND "dueDate" IS NOT NULL AND "dueDate" < "startDate"` },
    { name: 'project_phases con endDate anterior a startDate',
      sql: `SELECT count(*)::int FROM project_phases WHERE "startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "endDate" < "startDate"` },
    { name: 'project_tasks COMPLETED sin completedAt',
      sql: `SELECT count(*)::int FROM project_tasks WHERE status = 'COMPLETED' AND "completedAt" IS NULL` },
    { name: 'project_tasks con completedAt pero no COMPLETED',
      sql: `SELECT count(*)::int FROM project_tasks WHERE status IS DISTINCT FROM 'COMPLETED' AND "completedAt" IS NOT NULL` },
    { name: 'time_entries con endTime anterior a startTime',
      sql: `SELECT count(*)::int FROM time_entries WHERE "startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "endTime" < "startTime"` },
];

async function main() {
    let failed = 0;
    const rows: Array<{ regla: string; violaciones: number }> = [];

    for (const check of CHECKS) {
        const result = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(check.sql);
        const count = Number(Object.values(result[0] ?? {})[0] ?? 0);
        rows.push({ regla: check.name, violaciones: count });
        if (count > 0) failed++;
    }

    console.table(rows);
    console.log(failed === 0 ? '\n✅ Sin violaciones.' : `\n❌ ${failed} regla(s) con violaciones.`);
    process.exit(failed === 0 ? 0 : 1);
}

main()
    .catch((e) => { console.error(e); process.exit(2); })
    .finally(() => prisma.$disconnect());
