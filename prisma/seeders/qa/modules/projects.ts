import { PrismaClient } from '@prisma/client';
import { qaId, daysAgo, daysFromNow } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_SALES_1, P_FREELANCER, P_BETA_ADMIN } from '../core';
// Estados desde el catálogo: projects_status_check (migración
// add_catalog_checks) sólo admite NOT_STARTED | IN_PROGRESS | ON_HOLD |
// COMPLETED | ARCHIVED. Los literales antiguos violan la restricción.
import { ARCHIVED_PROJECT_STATUS, DEFAULT_PROJECT_STATUS } from '../../../../src/constants/enums';

export const PR_PORTAL = qaId('project:portal');
export const PR_APP = qaId('project:app');
export const PR_SIN_FASES = qaId('project:sin-fases');
export const PR_ARCHIVADO = qaId('project:archivado');
export const PR_BETA = qaId('project:beta');

/** Fases del proyecto principal, con tareas dentro. */
export const PH_DESCUBRIMIENTO = qaId('phase:descubrimiento');
export const PH_DISENO = qaId('phase:diseno');
export const PH_DESARROLLO = qaId('phase:desarrollo');
export const PH_QA = qaId('phase:qa');

/** Tarea deliberadamente sin fase: cae en `unassignedTasks` de /tracking. */
export const PT_SIN_FASE = qaId('ptask:sin-fase');
export const PT_VENCIDA = qaId('ptask:vencida');
export const PT_EN_CURSO = qaId('ptask:en-curso');

export async function seedProjects(prisma: PrismaClient): Promise<string> {
    // ── Proyectos ───────────────────────────────────────────────────────────
    const proyectos = [
        {
            id: PR_PORTAL, name: 'Portal de clientes Andina',
            description: 'Portal web para que el cliente siga el avance de sus obras.',
            status: 'IN_PROGRESS', complexity: 'high', price: 42000, revenue: 18000,
            startDate: daysAgo(45), endDate: daysFromNow(45),
            prd: 'Objetivo: entregar un portal donde el cliente consulte avance, documentos y facturas.\n\nAlcance: autenticación, tablero de avance, descarga de documentos y notificaciones por correo.\n\nFuera de alcance: pagos en línea.',
            projectLeadId: P_ADMIN,
            productionUrl: 'https://portal-andina.test',
            githubOwner: 'domotai', repositoryName: 'portal-andina',
        },
        {
            id: PR_APP, name: 'App móvil de terreno',
            description: 'Aplicación para reportes de terreno sin conexión.',
            status: 'IN_PROGRESS', complexity: 'medium', price: 28000, revenue: 0,
            startDate: daysAgo(20), endDate: daysFromNow(70),
            prd: 'Aplicación móvil para capturar reportes en obra sin conexión y sincronizar al recuperar señal.',
            projectLeadId: P_FREELANCER,
            productionUrl: null, githubOwner: null, repositoryName: null,
        },
        {
            // Caso límite: proyecto sin fases ni tareas. El Gantt y el kanban
            // deben mostrar un estado vacío, no romperse.
            id: PR_SIN_FASES, name: 'Consultoría Norte (sin planificar)',
            description: 'Aún sin fases ni tareas cargadas.',
            status: DEFAULT_PROJECT_STATUS, complexity: 'low', price: 9000, revenue: 0,
            startDate: null, endDate: null, prd: null,
            projectLeadId: null, productionUrl: null, githubOwner: null, repositoryName: null,
        },
        {
            // Caso límite: archivado. El archivo se marca con el estado ARCHIVED.
            id: PR_ARCHIVADO, name: 'Migración legacy 2025 (archivado)',
            description: 'Cerrado y archivado.',
            status: ARCHIVED_PROJECT_STATUS, complexity: 'medium', price: 15000, revenue: 15000,
            startDate: daysAgo(300), endDate: daysAgo(120), prd: null,
            projectLeadId: P_ADMIN, productionUrl: null, githubOwner: null, repositoryName: null,
        },
    ];

    for (const p of proyectos) {
        await prisma.project.upsert({
            where: { id: p.id },
            update: { status: p.status, name: p.name },
            create: { ...p, pricingType: 'flat', createdBy: P_ADMIN, organizationId: ORG_A },
        });
    }

    await prisma.project.upsert({
        where: { id: PR_BETA },
        update: {},
        create: {
            id: PR_BETA, name: 'Proyecto Contoso (org B)', status: 'IN_PROGRESS',
            price: 10000, createdBy: P_BETA_ADMIN, projectLeadId: P_BETA_ADMIN, organizationId: ORG_B,
        },
    });

    // ── Fases ───────────────────────────────────────────────────────────────
    const fases = [
        { id: PH_DESCUBRIMIENTO, projectId: PR_PORTAL, name: 'Descubrimiento', orderIndex: 0, status: 'completed', startDate: daysAgo(45), endDate: daysAgo(32), description: 'Entrevistas y definición de alcance.' },
        { id: PH_DISENO, projectId: PR_PORTAL, name: 'Diseño', orderIndex: 1, status: 'completed', startDate: daysAgo(32), endDate: daysAgo(18), description: 'Wireframes y diseño visual.' },
        { id: PH_DESARROLLO, projectId: PR_PORTAL, name: 'Desarrollo', orderIndex: 2, status: 'active', startDate: daysAgo(18), endDate: daysFromNow(25), description: 'Implementación del portal.' },
        { id: PH_QA, projectId: PR_PORTAL, name: 'QA y despliegue', orderIndex: 3, status: 'active', startDate: daysFromNow(25), endDate: daysFromNow(45), description: 'Pruebas, correcciones y puesta en producción.' },
        { id: qaId('phase:app-mvp'), projectId: PR_APP, name: 'MVP', orderIndex: 0, status: 'active', startDate: daysAgo(20), endDate: daysFromNow(40), description: 'Primera versión usable.' },
    ];
    for (const f of fases) {
        await prisma.projectPhase.upsert({
            where: { id: f.id }, update: { status: f.status },
            create: { ...f, createdBy: P_ADMIN },
        });
    }

    // ── Tareas de proyecto ──────────────────────────────────────────────────
    const tareas = [
        { id: qaId('ptask:entrevistas'), phaseId: PH_DESCUBRIMIENTO, title: 'Entrevistar a 5 usuarios clave', status: 'COMPLETED', priority: 'HIGH', assignedTo: P_ADMIN, startDate: daysAgo(45), dueDate: daysAgo(40), completedAt: daysAgo(41) },
        { id: qaId('ptask:alcance'), phaseId: PH_DESCUBRIMIENTO, title: 'Documentar alcance y criterios de aceptación', status: 'COMPLETED', priority: 'HIGH', assignedTo: P_ADMIN, startDate: daysAgo(40), dueDate: daysAgo(33), completedAt: daysAgo(34) },
        { id: qaId('ptask:wireframes'), phaseId: PH_DISENO, title: 'Wireframes de las 6 pantallas principales', status: 'COMPLETED', priority: 'MEDIUM', assignedTo: P_FREELANCER, startDate: daysAgo(32), dueDate: daysAgo(24), completedAt: daysAgo(25) },
        { id: qaId('ptask:visual'), phaseId: PH_DISENO, title: 'Diseño visual y sistema de componentes', status: 'COMPLETED', priority: 'MEDIUM', assignedTo: P_FREELANCER, startDate: daysAgo(24), dueDate: daysAgo(18), completedAt: daysAgo(19) },
        { id: PT_EN_CURSO, phaseId: PH_DESARROLLO, title: 'Autenticación y gestión de sesión', status: 'IN_PROGRESS', priority: 'URGENT', assignedTo: P_FREELANCER, startDate: daysAgo(18), dueDate: daysFromNow(4), completedAt: null },
        { id: PT_VENCIDA, phaseId: PH_DESARROLLO, title: 'Tablero de avance de obra', status: 'IN_PROGRESS', priority: 'HIGH', assignedTo: P_FREELANCER, startDate: daysAgo(14), dueDate: daysAgo(6), completedAt: null },
        { id: qaId('ptask:documentos'), phaseId: PH_DESARROLLO, title: 'Descarga de documentos desde S3', status: 'TODO', priority: 'MEDIUM', assignedTo: null, startDate: null, dueDate: daysFromNow(12), completedAt: null },
        { id: qaId('ptask:bloqueada'), phaseId: PH_DESARROLLO, title: 'Integración con ERP del cliente', status: 'ON_HOLD', priority: 'LOW', assignedTo: P_ADMIN, startDate: null, dueDate: daysFromNow(30), completedAt: null },
        { id: qaId('ptask:pruebas'), phaseId: PH_QA, title: 'Plan de pruebas de aceptación', status: 'TODO', priority: 'MEDIUM', assignedTo: P_ADMIN, startDate: daysFromNow(25), dueDate: daysFromNow(35), completedAt: null },
        // Caso límite: sin fase. Debe aparecer en `unassignedTasks`.
        { id: PT_SIN_FASE, phaseId: null, title: 'Revisar accesibilidad (sin fase asignada)', status: 'TODO', priority: 'LOW', assignedTo: null, startDate: null, dueDate: null, completedAt: null },
        { id: qaId('ptask:app-login'), phaseId: qaId('phase:app-mvp'), title: 'Login offline con caché local', status: 'IN_PROGRESS', priority: 'HIGH', assignedTo: P_FREELANCER, startDate: daysAgo(15), dueDate: daysFromNow(8), completedAt: null },
        { id: qaId('ptask:app-sync'), phaseId: qaId('phase:app-mvp'), title: 'Sincronización al recuperar conexión', status: 'TODO', priority: 'URGENT', assignedTo: P_FREELANCER, startDate: null, dueDate: daysFromNow(20), completedAt: null },
    ];

    for (const t of tareas) {
        const projectId = t.id === qaId('ptask:app-login') || t.id === qaId('ptask:app-sync') ? PR_APP : PR_PORTAL;
        await prisma.projectTask.upsert({
            where: { id: t.id },
            update: { status: t.status, dueDate: t.dueDate },
            create: {
                ...t, projectId, organizationId: ORG_A, orderIndex: 0,
                description: `Tarea de QA. Estado ${t.status}, prioridad ${t.priority}.`,
                createdBy: P_ADMIN,
            },
        });
    }

    // El `update` restaura título y estado a propósito: la prueba de
    // aislamiento consiste en corromper esta fila desde la organización A,
    // así que re-sembrar el módulo tiene que dejarla como estaba.
    await prisma.projectTask.upsert({
        where: { id: qaId('ptask:beta') },
        update: { title: 'Tarea Contoso (org B)', status: 'TODO' },
        create: {
            id: qaId('ptask:beta'), projectId: PR_BETA, organizationId: ORG_B,
            title: 'Tarea Contoso (org B)', status: 'TODO', priority: 'MEDIUM',
            assignedTo: P_BETA_ADMIN, createdBy: P_BETA_ADMIN,
        },
    });

    // ── Equipo ──────────────────────────────────────────────────────────────
    const equipo = [
        { id: qaId('team:portal-admin'), projectId: PR_PORTAL, userId: P_ADMIN },
        { id: qaId('team:portal-free'), projectId: PR_PORTAL, userId: P_FREELANCER },
        { id: qaId('team:portal-sales'), projectId: PR_PORTAL, userId: P_SALES_1 },
        { id: qaId('team:app-free'), projectId: PR_APP, userId: P_FREELANCER },
    ];
    for (const m of equipo) {
        await prisma.projectTeamMember.upsert({ where: { id: m.id }, update: {}, create: m });
    }

    // ── Hitos ───────────────────────────────────────────────────────────────
    // Nota: no hay endpoints para crearlos desde la app (hallazgo de auditoría).
    // Se siembran para que la barra de progreso de ProjectList muestre algo.
    const hitos = [
        { id: qaId('milestone:kickoff'), projectId: PR_PORTAL, title: 'Kickoff con el cliente', dueDate: daysAgo(45), completed: true },
        { id: qaId('milestone:diseno'), projectId: PR_PORTAL, title: 'Diseño aprobado', dueDate: daysAgo(18), completed: true },
        { id: qaId('milestone:beta'), projectId: PR_PORTAL, title: 'Versión beta en staging', dueDate: daysFromNow(20), completed: false },
        { id: qaId('milestone:go-live'), projectId: PR_PORTAL, title: 'Puesta en producción', dueDate: daysFromNow(45), completed: false },
    ];
    for (const h of hitos) {
        await prisma.projectMilestone.upsert({
            where: { id: h.id }, update: { completed: h.completed },
            create: { ...h, description: null },
        });
    }

    return `${proyectos.length} en org A (1 sin fases, 1 archivado) + 1 en org B · ${fases.length} fases · ${tareas.length} tareas (1 sin fase, 1 vencida) · ${hitos.length} hitos`;
}
