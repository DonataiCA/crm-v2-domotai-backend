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

function handlerNamesOf(router: Router, method: string, path: string): string[] {
    const layer = (router as any).stack.find(
        (l: any) => l.route?.path === path && l.route.methods[method],
    );
    if (!layer) throw new Error(`No existe ${method.toUpperCase()} ${path}`);
    return layer.route.stack.map((l: any) => l.name);
}

/**
 * Importar, sincronizar, exportar y reordenar reescriben (o vuelcan) las tareas de un
 * proyecto en bloque. Son sólo para el equipo: pmo, client y viewer ven el proyecto
 * pero no lo editan, y el backend lo impone en vez de fiarse de que la UI esconda el
 * botón.
 */
describe('las operaciones en bloque sobre tareas exigen rol de equipo', () => {
    const cases: Array<[string, string, string]> = [
        ['POST /projects/:projectId/import-tasks', 'post', '/:projectId/import-tasks'],
        ['PUT /projects/:projectId/tasks/reorder', 'put', '/:projectId/tasks/reorder'],
        ['GET /projects/:projectId/tasks/export', 'get', '/:projectId/tasks/export'],
        ['POST /projects/:projectId/tasks/sync/preview', 'post', '/:projectId/tasks/sync/preview'],
        ['POST /projects/:projectId/tasks/sync/apply', 'post', '/:projectId/tasks/sync/apply'],
    ];

    for (const [name, method, path] of cases) {
        it(name, () => {
            const names = handlerNamesOf(projectRoutes, method, path);
            expect(names).toContain('requireTeamRole');
            // Antes que el validador: un rol sin permiso no llega ni a ver el error de formato.
            expect(names.indexOf('requireTeamRole')).toBe(0);
        });
    }

    it.each([
        ['put', '/:projectId/tasks/reorder'],
        ['post', '/:projectId/tasks/sync/preview'],
        ['post', '/:projectId/tasks/sync/apply'],
    ])('%s %s valida el cuerpo', (method, path) => {
        expect(handlersOf(projectRoutes, method, path)).toBeGreaterThanOrEqual(3);
    });
});
