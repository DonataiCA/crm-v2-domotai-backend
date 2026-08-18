import { describe, it, expect } from 'vitest';
import { shareProjectSchema } from './portal.validator';

/**
 * `enums.test.ts` ya cubre `normalizeSharePermissions`, la función. Esto cubre
 * el esquema que la usa, que es otra cosa: el camino
 * `union → transform → ctx.addIssue` puede romperse sin que aquellos tests se
 * enteren, y es el único que separa a `project_shares.permissions` de recibir
 * texto libre.
 */
const BASE = { clientEmail: 'cliente@example.com', clientName: 'Cliente' };

describe('shareProjectSchema.permissions', () => {
    it('acepta las tres combinaciones que hay en la base y las deja canónicas', () => {
        for (const permissions of ['view', 'view,comment', 'view,comment,create_task,edit_task']) {
            const result = shareProjectSchema.safeParse({ ...BASE, permissions });
            expect(result.success, permissions).toBe(true);
            if (result.success) expect(result.data.permissions).toBe(permissions);
        }
    });

    it('acepta un array y lo guarda como CSV', () => {
        // La columna es String: antes el controlador guardaba el array tal cual
        // y Prisma reventaba en tiempo de ejecución.
        const result = shareProjectSchema.safeParse({ ...BASE, permissions: ['view', 'comment'] });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.permissions).toBe('view,comment');
    });

    it('normaliza casing y espacios sobrantes', () => {
        const result = shareProjectSchema.safeParse({ ...BASE, permissions: ' View , COMMENT ' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.permissions).toBe('view,comment');
    });

    it('reordena según el catálogo, para que el CHECK sea predecible', () => {
        const result = shareProjectSchema.safeParse({ ...BASE, permissions: 'edit_task,view' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.permissions).toBe('view,edit_task');
    });

    it('rechaza un permiso inventado', () => {
        const result = shareProjectSchema.safeParse({ ...BASE, permissions: 'view,borrar_todo' });
        expect(result.success).toBe(false);
    });

    it('rechaza el vocabulario en mayúscula que declaraba el catálogo viejo', () => {
        expect(shareProjectSchema.safeParse({ ...BASE, permissions: 'VIEW,EDIT' }).success).toBe(false);
    });

    it('el mensaje de error nombra los permisos válidos', () => {
        const result = shareProjectSchema.safeParse({ ...BASE, permissions: 'root' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain('view, comment, create_task, edit_task');
        }
    });

    it('deja pasar la ausencia de permissions: el controlador aplica el default', () => {
        const result = shareProjectSchema.safeParse(BASE);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.permissions).toBeUndefined();
    });

    it('rechaza la cadena vacía en vez de guardar un permiso sin sentido', () => {
        expect(shareProjectSchema.safeParse({ ...BASE, permissions: '' }).success).toBe(false);
    });
});

describe('shareProjectSchema: resto de campos', () => {
    it('exige un email válido', () => {
        expect(shareProjectSchema.safeParse({ ...BASE, clientEmail: 'no-es-email' }).success).toBe(false);
    });

    it('exige nombre de cliente', () => {
        expect(shareProjectSchema.safeParse({ ...BASE, clientName: '' }).success).toBe(false);
    });

    it('descarta campos que el cliente no controla', () => {
        const result = shareProjectSchema.safeParse({
            ...BASE,
            organizationId: 'otra-org',
            createdBy: 'alguien',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).not.toHaveProperty('organizationId');
            expect(result.data).not.toHaveProperty('createdBy');
        }
    });
});
