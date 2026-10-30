import { Request, Response } from 'express';
import { ProjectRepository } from '../repositories/project.repository';
import { TaskSyncRepository } from '../repositories/task-sync.repository';
import { sendError } from '../utils/error';
import { notify } from '../utils/notify';
import { logAudit } from '../utils/audit';
import { buildExport, exportFileName } from '../utils/task-sync/build-export';
import { parseSyncDocument } from '../utils/task-sync/parse';
import { assignmentsByRecipient, planSync, selectApplied, type SyncPlan } from '../utils/task-sync/plan';

/**
 * Operaciones en bloque sobre las tareas de un proyecto. Todas las rutas que llegan
 * aquí pasan antes por `requireTeamRole`.
 *
 * El ciclo es exportar → editar fuera (a mano o con Claude Code) → previsualizar →
 * confirmar. La vista previa no escribe nada; la confirmación vuelve a calcular el plan
 * en el servidor y sólo lo aplica si sigue siendo el que el usuario vio (`planHash`).
 */

interface SyncDocumentBody {
    document: { fileName: string; content: string };
}

/**
 * Lee el archivo y calcula el plan contra el estado actual. Devuelve `null` si ya
 * respondió (404 o 422).
 */
async function planFor(req: Request, res: Response): Promise<{ plan: SyncPlan; state: any; project: any } | null> {
    const orgId = (req as any).orgId;
    const { projectId } = req.params;
    const { document } = req.body as SyncDocumentBody;

    const project = await ProjectRepository.findById(projectId, orgId);
    if (!project) {
        sendError(res, 404, 'Project not found');
        return null;
    }

    const parsed = parseSyncDocument(document.content, { projectId });
    if (parsed.issues.length) {
        res.status(422).json({ issues: parsed.issues, warnings: [] });
        return null;
    }

    const fileIds = parsed.tasks.map((t) => t.id).filter((id): id is string => !!id);
    const state = await TaskSyncRepository.getSyncState(projectId, orgId, fileIds);
    const plan = planSync(parsed.tasks, state);
    if (plan.issues.length) {
        res.status(422).json({ issues: plan.issues, warnings: plan.warnings });
        return null;
    }
    return { plan, state, project };
}

function plural(n: number, one: string, many: string) {
    return `${n} ${n === 1 ? one : many}`;
}

export const TaskSyncController = {
    /** `PUT /projects/:projectId/tasks/reorder` — orden de una columna del Kanban. */
    reorder: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { projectId } = req.params;
            const { orderedIds } = req.body as { orderedIds: string[] };

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            await TaskSyncRepository.reorderTasks(projectId, orgId, orderedIds);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to reorder tasks', error);
        }
    },

    /** `GET /projects/:projectId/tasks/export` — descarga `tasks-<proyecto>-<fecha>.json`. */
    exportTasks: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const profileId = (req as any).user?.profileId as string | undefined;
            const { projectId } = req.params;

            const project = await ProjectRepository.findById(projectId, orgId);
            if (!project) return sendError(res, 404, 'Project not found');

            const [state, exportedBy] = await Promise.all([
                TaskSyncRepository.getSyncState(projectId, orgId, []),
                TaskSyncRepository.getActor(profileId),
            ]);
            const exportedAt = new Date();
            const doc = buildExport(state, { exportedAt, exportedBy });
            const fileName = exportFileName(state.project.name, exportedAt);

            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            // Indentado: lo van a leer y editar personas y agentes, no sólo máquinas.
            // `send` y no `json` para que no pase por el replacer de decimales de app.ts.
            res.type('application/json').send(JSON.stringify(doc, null, 2));

            await logAudit(req, {
                action: 'EXPORT',
                entityType: 'Project',
                entityId: projectId,
                entityName: state.project.name,
                details: `${plural(doc.tasks.length, 'tarea exportada', 'tareas exportadas')} (${fileName})`,
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to export tasks', error);
        }
    },

    /** `POST /projects/:projectId/tasks/sync/preview` — qué cambiaría, sin escribir nada. */
    preview: async (req: Request, res: Response) => {
        try {
            const result = await planFor(req, res);
            if (!result) return;
            res.json(result.plan);
        } catch (error) {
            return sendError(res, 500, 'Failed to preview task import', error);
        }
    },

    /** `POST /projects/:projectId/tasks/sync/apply` — aplica el plan que el usuario vio. */
    apply: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const profileId = (req as any).user?.profileId as string | undefined;
            const { projectId } = req.params;
            const { planHash, applyConflicts } = req.body as { planHash: string; applyConflicts: string[] };

            const result = await planFor(req, res);
            if (!result) return;
            const { plan, state } = result;

            if (plan.planHash !== planHash) {
                return res.status(409).json({
                    message: 'El proyecto cambió desde la vista previa. Vuelve a previsualizar el archivo antes de confirmar.',
                    plan,
                });
            }

            const applied = selectApplied(plan, applyConflicts);
            await TaskSyncRepository.applySyncPlan(applied, { projectId, organizationId: orgId, actorId: profileId, state });

            const counts = {
                creates: applied.creates.length,
                updates: applied.updates.length,
                deletes: applied.deletes.length,
                moves: applied.moves.length,
                tagsToCreate: applied.tagsToCreate.length,
            };
            res.json({ applied: counts, skippedConflicts: applied.skippedConflicts, warnings: plan.warnings });

            await logAudit(req, {
                action: 'IMPORT',
                entityType: 'Project',
                entityId: projectId,
                entityName: state.project.name,
                details: [
                    plural(counts.creates, 'creada', 'creadas'),
                    plural(counts.updates, 'modificada', 'modificadas'),
                    plural(counts.deletes, 'eliminada', 'eliminadas'),
                    plural(counts.moves, 'movida', 'movidas'),
                    plural(applied.skippedConflicts.length, 'conflicto omitido', 'conflictos omitidos'),
                ].join(', '),
            });

            // Un aviso por persona con todas sus tareas, no uno por tarea.
            for (const { recipientId, titles } of assignmentsByRecipient(applied, profileId)) {
                await notify({
                    organizationId: orgId,
                    type: 'PROJECT_TASK_ASSIGNED',
                    title: titles.length === 1
                        ? `New task assigned: ${titles[0]}`
                        : `${titles.length} tasks assigned to you in ${state.project.name}`,
                    body: titles.join('\n'),
                    entityType: 'Project',
                    actorId: profileId,
                    recipientUserId: recipientId,
                    metadata: {
                        projectId,
                        projectName: state.project.name,
                        taskTitle: titles.join(', '),
                        assigneeName: '',
                        assignedBy: '',
                        dueDate: '',
                    },
                });
            }
        } catch (error) {
            return sendError(res, 500, 'Failed to import tasks', error);
        }
    },
};
