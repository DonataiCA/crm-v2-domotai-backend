import { Request, Response } from 'express';
import { ProjectRepository } from '../repositories/project.repository';
import { TaskSyncRepository } from '../repositories/task-sync.repository';
import { sendError } from '../utils/error';

/**
 * Operaciones en bloque sobre las tareas de un proyecto. Todas las rutas que llegan
 * aquí pasan antes por `requireTeamRole`.
 */
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
};
