import { PrismaClient } from '@prisma/client';
import { qaId, daysAgo, daysFromNow } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_BETA_ADMIN } from '../core';
import { PR_PORTAL, PR_APP, PR_BETA } from './projects';

/**
 * Enlaces del portal de cliente. Los tokens son fijos y legibles a propósito:
 * shareToken NO pasa por ningún validador .uuid(), así que puede ser un texto
 * cómodo de escribir en la barra de direcciones durante las pruebas.
 *
 *   http://localhost:8080/portal/qa-portal-activo
 *
 * Cubre los tres estados que el backend distingue (activo, caducado 410,
 * revocado 410) y cada combinación de permisos.
 */
export const TOKEN_ACTIVO = 'qa-portal-activo';
export const TOKEN_CADUCADO = 'qa-portal-caducado';
export const TOKEN_REVOCADO = 'qa-portal-revocado';
export const TOKEN_SOLO_LECTURA = 'qa-portal-solo-lectura';
export const TOKEN_COMPLETO = 'qa-portal-completo';

export async function seedPortal(prisma: PrismaClient): Promise<string> {
    const shares = [
        {
            key: 'activo', shareToken: TOKEN_ACTIVO, projectId: PR_PORTAL,
            clientEmail: 'qa.client@domotai.test', clientName: 'Clara Cliente',
            permissions: 'view,comment', expiresAt: daysFromNow(30), revokedAt: null,
        },
        {
            // Caso límite: caducado. Debe responder 410.
            key: 'caducado', shareToken: TOKEN_CADUCADO, projectId: PR_PORTAL,
            clientEmail: 'qa.client@domotai.test', clientName: 'Clara Cliente',
            permissions: 'view,comment', expiresAt: daysAgo(3), revokedAt: null,
        },
        {
            // Caso límite: revocado. Debe responder 410 aunque no haya caducado.
            key: 'revocado', shareToken: TOKEN_REVOCADO, projectId: PR_PORTAL,
            clientEmail: 'qa.client@domotai.test', clientName: 'Clara Cliente',
            permissions: 'view,comment', expiresAt: daysFromNow(60), revokedAt: daysAgo(1),
        },
        {
            // Permisos mínimos: comentar debe devolver 403.
            key: 'solo-lectura', shareToken: TOKEN_SOLO_LECTURA, projectId: PR_APP,
            clientEmail: 'qa.readonly@domotai.test', clientName: 'Lector Externo',
            permissions: 'view', expiresAt: null, revokedAt: null,
        },
        {
            // Permisos máximos: crear y editar tareas como invitado.
            key: 'completo', shareToken: TOKEN_COMPLETO, projectId: PR_APP,
            clientEmail: 'qa.poweruser@domotai.test', clientName: 'Cliente Avanzado',
            permissions: 'view,comment,create_task,edit_task', expiresAt: null, revokedAt: null,
        },
    ];

    for (const s of shares) {
        const { key, ...data } = s;
        await prisma.projectShare.upsert({
            where: { id: qaId(`share:${key}`) },
            update: { expiresAt: data.expiresAt, revokedAt: data.revokedAt },
            create: {
                id: qaId(`share:${key}`), ...data,
                createdBy: P_ADMIN, organizationId: ORG_A,
            },
        });
    }

    await prisma.projectShare.upsert({
        where: { id: qaId('share:beta') },
        update: {},
        create: {
            id: qaId('share:beta'), shareToken: 'qa-portal-contoso', projectId: PR_BETA,
            clientEmail: 'cliente@contoso.test', clientName: 'Cliente Contoso',
            permissions: 'view', createdBy: P_BETA_ADMIN, organizationId: ORG_B,
        },
    });

    // Comentario de invitado ya existente, para ver el marcado createdByGuest
    await prisma.taskComment.upsert({
        where: { id: qaId('comment:guest') },
        update: {},
        create: {
            id: qaId('comment:guest'),
            projectTaskId: qaId('ptask:documentos'),
            organizationId: ORG_A,
            content: '¿Podemos incluir también los planos en PDF? Gracias.',
            createdByGuest: true, guestEmail: 'qa.client@domotai.test',
        },
    });

    return `${shares.length} enlaces en org A (activo, caducado, revocado, solo lectura, completo) + 1 en org B · 1 comentario de invitado`;
}
