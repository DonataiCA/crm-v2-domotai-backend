import { describe, it, expect } from 'vitest';
import type { Router } from 'express';

import projectRoutes from './project.routes';
import taskRoutes from './task.routes';
import timeEntryRoutes from './time-entry.routes';

/**
 * Un esquema que no está montado en la ruta no protege nada. Estas rutas
 * escribían req.body tal cual en Prisma (asignación masiva); se comprueba que
 * cada una tenga un middleware antes del controlador. El authenticate y el
 * requireOrgMembership van en `router.use`, así que no cuentan aquí.
 */
function handlersOf(router: Router, method: string, path: string): number {
    const layer = (router as any).stack.find(
        (l: any) => l.route?.path === path && l.route.methods[method],
    );
    if (!layer) throw new Error(`No existe ${method.toUpperCase()} ${path}`);
    return layer.route.stack.length;
}

describe('las rutas de escritura validan el cuerpo', () => {
    const cases: Array<[string, Router, string, string]> = [
        ['PUT /projects/project-tasks/:taskId', projectRoutes, 'put', '/project-tasks/:taskId'],
        ['PUT /projects/phases/:phaseId', projectRoutes, 'put', '/phases/:phaseId'],
        ['PUT /tasks/bulk', taskRoutes, 'put', '/bulk'],
        ['POST /time-entries', timeEntryRoutes, 'post', '/'],
        ['POST /time-entries/start', timeEntryRoutes, 'post', '/start'],
        ['PUT /time-entries/:id', timeEntryRoutes, 'put', '/:id'],
    ];

    for (const [name, router, method, path] of cases) {
        it(name, () => {
            expect(handlersOf(router, method, path)).toBeGreaterThanOrEqual(2);
        });
    }
});
