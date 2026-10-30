import { prisma } from '../config/prisma';

/**
 * Escrituras en bloque sobre las tareas de un proyecto: el orden del Kanban y la
 * sincronización con el archivo JSON exportado. Van aparte de `ProjectRepository`
 * porque ese archivo ya concentra el CRUD de proyecto, fases y tareas.
 */
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
};
