import { prisma } from '../config/prisma';
import type { SyncState } from '../utils/task-sync/format';
import { columnOrderWrites, type AppliedPlan, type Completion } from '../utils/task-sync/plan';

/**
 * Escrituras en bloque sobre las tareas de un proyecto: el orden del Kanban y la
 * sincronización con el archivo JSON exportado. Van aparte de `ProjectRepository`
 * porque ese archivo ya concentra el CRUD de proyecto, fases y tareas.
 *
 * Las reglas (qué cambia, qué es conflicto) viven en `utils/task-sync/`, que es puro.
 * Aquí sólo se lee el estado y se escribe el plan ya decidido.
 */

/** Interactiva: el plan crea tareas y después usa sus ids para etiquetas y orden. */
const APPLY_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

function completedAtFor(completion: Completion | undefined, now: Date): { completedAt?: Date | null } {
    if (completion === 'set') return { completedAt: now };
    if (completion === 'clear') return { completedAt: null };
    return {};
}

export const TaskSyncRepository = {
    /**
     * Fija el `orderIndex` de una columna del Kanban: la posición en `orderedIds` es el
     * orden. El filtro por proyecto y organización hace que un id ajeno no se toque.
     * Mismo patrón que `ProjectLinkRepository.reorder`.
     */
    reorderTasks: (projectId: string, organizationId: string, orderedIds: string[]) =>
        prisma.$transaction(
            orderedIds.map((id, index) =>
                prisma.projectTask.updateMany({
                    where: { id, projectId, organizationId },
                    data: { orderIndex: index },
                }),
            ),
        ),

    /** Nombre y email de quien exporta, para la cabecera del archivo. */
    getActor: async (profileId: string | undefined) => {
        if (!profileId) return { name: null, email: null };
        const profile = await prisma.profile.findUnique({
            where: { id: profileId },
            select: { fullName: true, email: true },
        });
        return { name: profile?.fullName ?? null, email: profile?.email ?? null };
    },

    /**
     * Todo lo que necesitan la exportación y el plan, en una pasada.
     *
     * @param fileTaskIds Ids que trae el archivo. Los que existen en la organización
     * pero en otro proyecto se devuelven en `foreignTaskIds` para rechazarlos con un
     * mensaje claro. Los de otra organización no se distinguen de los inexistentes.
     */
    getSyncState: async (projectId: string, organizationId: string, fileTaskIds: string[]): Promise<SyncState> => {
        const [project, phases, tasks, teamMembers, orgMembers, tags, time, foreign] = await Promise.all([
            prisma.project.findFirstOrThrow({
                where: { id: projectId, organizationId },
                select: { id: true, name: true, description: true, status: true, startDate: true, endDate: true },
            }),
            prisma.projectPhase.findMany({
                where: { projectId },
                orderBy: { orderIndex: 'asc' },
                select: { id: true, name: true, status: true, orderIndex: true, startDate: true, endDate: true },
            }),
            prisma.projectTask.findMany({
                where: { projectId, organizationId },
                include: {
                    assignee: { select: { email: true } },
                    creator: { select: { fullName: true, email: true } },
                    taskTags: { select: { tagId: true } },
                    deliverables: { orderBy: { orderIndex: 'asc' } },
                    comments: {
                        orderBy: { createdAt: 'asc' },
                        include: { creator: { select: { fullName: true, email: true } } },
                    },
                },
            }),
            prisma.projectTeamMember.findMany({
                where: { projectId, project: { organizationId } },
                include: { profile: { select: { id: true, fullName: true, email: true, role: true } } },
            }),
            prisma.organizationMember.findMany({
                where: { organizationId },
                include: { profile: { select: { id: true, fullName: true, email: true, role: true } } },
            }),
            prisma.tag.findMany({ where: { organizationId }, select: { id: true, name: true } }),
            prisma.timeEntry.groupBy({
                by: ['projectTaskId'],
                where: { organizationId, projectTask: { projectId } },
                _sum: { durationMinutes: true },
            }),
            fileTaskIds.length
                ? prisma.projectTask.findMany({
                    where: { id: { in: fileTaskIds }, organizationId, NOT: { projectId } },
                    select: { id: true },
                })
                : Promise.resolve([]),
        ]);

        const minutes = new Map(time.map((row) => [row.projectTaskId, row._sum.durationMinutes ?? 0]));
        // Mismo criterio que `getImportContext`: el equipo del proyecto o, si no tiene,
        // la organización. Sin repetidos: un `ProjectTeamMember` puede estar dos veces.
        const source = teamMembers.length > 0 ? teamMembers : orgMembers;
        const members = new Map<string, SyncState['members'][number]>();
        for (const m of source) {
            if (!m.profile) continue;
            members.set(m.profile.id, {
                id: m.profile.id,
                fullName: m.profile.fullName,
                email: m.profile.email,
                role: m.profile.role,
            });
        }

        return {
            project,
            phases,
            members: [...members.values()],
            tags,
            foreignTaskIds: foreign.map((t) => t.id),
            tasks: tasks.map((t) => ({
                id: t.id,
                title: t.title,
                description: t.description,
                conclusion: t.conclusion,
                status: t.status,
                priority: t.priority,
                phaseId: t.phaseId,
                assignedTo: t.assignedTo,
                assigneeEmail: t.assignee?.email ?? null,
                startDate: t.startDate,
                dueDate: t.dueDate,
                completedAt: t.completedAt,
                progress: t.progress,
                orderIndex: t.orderIndex,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                creatorName: t.creator?.fullName ?? t.creator?.email ?? (t.createdByGuest ? t.guestEmail : null),
                tagIds: t.taskTags.map((tt) => tt.tagId),
                deliverables: t.deliverables.map((d) => ({ id: d.id, title: d.title, done: d.done, orderIndex: d.orderIndex })),
                comments: t.comments.map((c) => ({
                    author: c.creator?.fullName ?? c.creator?.email ?? (c.createdByGuest ? c.guestEmail : null),
                    createdAt: c.createdAt,
                    content: c.content,
                })),
                timeLoggedMinutes: minutes.get(t.id) ?? 0,
            })),
        };
    },

    /**
     * Escribe el plan ya filtrado (sin los conflictos omitidos) en una sola transacción:
     * o se aplica entero o no se aplica nada.
     */
    applySyncPlan: (
        applied: AppliedPlan,
        ctx: { projectId: string; organizationId: string; actorId: string | undefined; state: SyncState },
    ) =>
        prisma.$transaction(async (tx) => {
            const { projectId, organizationId, actorId, state } = ctx;
            const now = new Date();

            // 1. Etiquetas nuevas. `upsert` por si alguien la creó entre la vista previa y
            //    la confirmación: el nombre es único por organización.
            const tagIdByLower = new Map(state.tags.map((t) => [t.name.trim().toLowerCase(), t.id]));
            for (const name of applied.tagsToCreate) {
                const nameLower = name.toLowerCase();
                const tag = await tx.tag.upsert({
                    where: { organizationId_nameLower: { organizationId, nameLower } },
                    update: {},
                    create: { name, nameLower, organizationId, createdBy: actorId ?? null },
                });
                tagIdByLower.set(nameLower, tag.id);
            }
            const tagIds = (names: string[]) => names.map((n) => tagIdByLower.get(n.trim().toLowerCase())!).filter(Boolean);

            // 2. Tareas nuevas, con sus etiquetas y entregables.
            const createdIdByRef = new Map<number, string>();
            for (const c of applied.creates) {
                const task = await tx.projectTask.create({
                    data: {
                        ...c.data,
                        ...completedAtFor(c.completion, now),
                        projectId,
                        organizationId,
                        createdBy: actorId ?? null,
                    },
                    select: { id: true },
                });
                createdIdByRef.set(c.ref, task.id);
                const ids = tagIds(c.tagNames);
                if (ids.length) {
                    await tx.projectTaskTag.createMany({ data: ids.map((tagId) => ({ projectTaskId: task.id, tagId })) });
                }
                if (c.deliverables.length) {
                    await tx.taskDeliverable.createMany({
                        data: c.deliverables.map((d, orderIndex) => ({
                            projectTaskId: task.id,
                            organizationId,
                            title: d.title,
                            done: d.done,
                            doneAt: d.done ? now : null,
                            orderIndex,
                            createdBy: actorId ?? null,
                        })),
                    });
                }
            }

            // 3. Tareas modificadas.
            for (const u of applied.updates) {
                const data = { ...u.data, ...completedAtFor(u.completion, now) };
                if (Object.keys(data).length) {
                    await tx.projectTask.updateMany({ where: { id: u.taskId, projectId, organizationId }, data });
                }
                if (u.tagNames) {
                    await tx.projectTaskTag.deleteMany({ where: { projectTaskId: u.taskId } });
                    const ids = tagIds(u.tagNames);
                    if (ids.length) {
                        await tx.projectTaskTag.createMany({ data: ids.map((tagId) => ({ projectTaskId: u.taskId, tagId })) });
                    }
                }
                if (u.deliverables) {
                    const { creates, updates, deletes } = u.deliverables;
                    if (deletes.length) {
                        await tx.taskDeliverable.deleteMany({ where: { id: { in: deletes }, projectTaskId: u.taskId } });
                    }
                    for (const d of updates) {
                        const { id, doneAt, ...rest } = d;
                        await tx.taskDeliverable.updateMany({
                            where: { id, projectTaskId: u.taskId },
                            data: { ...rest, ...(doneAt ? { doneAt: doneAt === 'set' ? now : null } : {}) },
                        });
                    }
                    if (creates.length) {
                        await tx.taskDeliverable.createMany({
                            data: creates.map((d) => ({
                                projectTaskId: u.taskId,
                                organizationId,
                                title: d.title,
                                done: d.done,
                                doneAt: d.done ? now : null,
                                orderIndex: d.orderIndex,
                                createdBy: actorId ?? null,
                            })),
                        });
                    }
                }
            }

            // 4. Eliminadas. Las horas registradas sobreviven (la FK es SET NULL).
            if (applied.deletes.length) {
                await tx.projectTask.deleteMany({
                    where: { id: { in: applied.deletes.map((d) => d.taskId) }, projectId, organizationId },
                });
            }

            // 5. Orden de cada columna del Kanban.
            for (const { id, orderIndex } of columnOrderWrites(state, applied, createdIdByRef)) {
                await tx.projectTask.updateMany({ where: { id, projectId, organizationId }, data: { orderIndex } });
            }

            return { createdIds: [...createdIdByRef.values()] };
        }, APPLY_TX_OPTIONS),
};
