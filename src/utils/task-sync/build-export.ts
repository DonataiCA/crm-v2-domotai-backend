import { TASK_PRIORITIES, TASK_STATUSES } from '../../constants/enums';
import {
    SYNC_INSTRUCTIONS,
    TASK_SYNC_FORMAT,
    TASK_SYNC_VERSION,
    canonicalPriority,
    canonicalStatus,
    revOfState,
    toDay,
    type DocTask,
    type StateTask,
    type SyncDocument,
    type SyncState,
} from './format';

/**
 * Orden de las tareas en el archivo: el del Kanban. Primero por columna (estado, en el
 * orden del catálogo) y dentro de cada una por `orderIndex`. `createdAt` e `id`
 * desempatan porque los `orderIndex` heredados se repiten (la plantilla Markdown los
 * numeraba por fase, no por columna). `plan.ts` usa el mismo criterio para saber si
 * una tarea cambió de posición.
 */
export function compareBoardOrder(a: StateTask, b: StateTask): number {
    const column = TASK_STATUSES.indexOf(canonicalStatus(a.status)) - TASK_STATUSES.indexOf(canonicalStatus(b.status));
    if (column !== 0) return column;
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    const created = a.createdAt.getTime() - b.createdAt.getTime();
    if (created !== 0) return created;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildExport(
    state: SyncState,
    options: { exportedAt: Date; exportedBy: { name: string | null; email: string | null } },
): SyncDocument {
    const phaseName = new Map(state.phases.map((p) => [p.id, p.name]));
    const tagName = new Map(state.tags.map((t) => [t.id, t.name]));

    const tasks: DocTask[] = [...state.tasks].sort(compareBoardOrder).map((task) => ({
        id: task.id,
        rev: revOfState(task),
        title: task.title,
        description: task.description,
        conclusion: task.conclusion,
        status: canonicalStatus(task.status),
        priority: canonicalPriority(task.priority),
        phase: task.phaseId ? phaseName.get(task.phaseId) ?? null : null,
        assignee: task.assigneeEmail,
        startDate: toDay(task.startDate),
        dueDate: toDay(task.dueDate),
        progress: task.progress,
        tags: task.tagIds.map((id) => tagName.get(id)).filter((name): name is string => !!name),
        deliverables: [...task.deliverables]
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((d) => ({ id: d.id, title: d.title, done: d.done })),
        readOnly: {
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            completedAt: task.completedAt ? task.completedAt.toISOString() : null,
            createdBy: task.creatorName,
            timeLoggedMinutes: task.timeLoggedMinutes,
            comments: task.comments.map((c) => ({
                author: c.author,
                date: c.createdAt.toISOString(),
                content: c.content,
            })),
        },
    }));

    return {
        format: TASK_SYNC_FORMAT,
        version: TASK_SYNC_VERSION,
        exportedAt: options.exportedAt.toISOString(),
        exportedBy: options.exportedBy,
        instructions: SYNC_INSTRUCTIONS,
        project: {
            id: state.project.id,
            name: state.project.name,
            description: state.project.description,
            status: state.project.status,
            startDate: toDay(state.project.startDate),
            endDate: toDay(state.project.endDate),
        },
        catalog: {
            statuses: [...TASK_STATUSES],
            priorities: [...TASK_PRIORITIES],
            phases: [...state.phases]
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((p) => ({
                    name: p.name,
                    status: p.status,
                    startDate: toDay(p.startDate),
                    endDate: toDay(p.endDate),
                    order: p.orderIndex,
                })),
            members: state.members.map((m) => ({ name: m.fullName, email: m.email, role: m.role })),
            tags: state.tags.map((t) => t.name).sort((a, b) => a.localeCompare(b)),
        },
        tasks,
    };
}

/** `'Portal de clientes Andina'` → `tasks-portal-de-clientes-andina-2026-10-30.json`. */
export function exportFileName(projectName: string, date: Date): string {
    const slug =
        projectName
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60)
            .replace(/-+$/g, '') || 'proyecto';
    return `tasks-${slug}-${toDay(date)}.json`;
}
