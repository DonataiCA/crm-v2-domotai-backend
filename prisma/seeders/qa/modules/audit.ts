import { PrismaClient } from '@prisma/client';
import { qaId } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_SALES_1, P_SALES_2, P_BETA_ADMIN } from '../core';
import { PR_PORTAL, PR_ARCHIVADO } from './projects';
import { LEAD_GANADO } from './leads';
import { CT_ARCHIVADO } from './contacts';

/**
 * Bitácora de auditoría. Cubre las siete acciones que `logAudit` emite hoy,
 * para que los filtros por acción y por tipo de entidad tengan resultados.
 *
 * Solo visible para el rol admin (la ruta lleva requireAdmin), así que sirve
 * también para verificar que un salesman recibe 403.
 */
export async function seedAudit(prisma: PrismaClient): Promise<string> {
    const ahora = Date.now();
    const HORA = 3600000;

    const rows = [
        { key: 'a1', h: 1, action: 'UPDATE', entityType: 'ProjectTask', entityId: qaId('ptask:vencida'), entityName: 'Tablero de avance de obra', userId: P_ADMIN, details: 'status: TODO → IN_PROGRESS' },
        { key: 'a2', h: 3, action: 'CREATE', entityType: 'Invoice', entityId: qaId('invoice:al-dia'), entityName: 'QA-2026-002', userId: P_ADMIN, details: null },
        { key: 'a3', h: 6, action: 'MARK_SENT', entityType: 'Invoice', entityId: qaId('invoice:al-dia'), entityName: 'QA-2026-002', userId: P_ADMIN, details: 'Enviada a p.rojas@andina.test' },
        { key: 'a4', h: 12, action: 'CONVERT', entityType: 'Lead', entityId: LEAD_GANADO, entityName: 'Oportunidad Ganado', userId: P_SALES_1, details: `Converted to project ${PR_PORTAL}` },
        { key: 'a5', h: 26, action: 'SHARE', entityType: 'Project', entityId: PR_PORTAL, entityName: 'Portal de clientes Andina', userId: P_ADMIN, details: 'Shared with qa.client@domotai.test' },
        { key: 'a6', h: 48, action: 'ARCHIVE', entityType: 'Contact', entityId: CT_ARCHIVADO, entityName: 'Rodrigo Antiguo (archivado)', userId: P_SALES_1, details: null },
        { key: 'a7', h: 72, action: 'ARCHIVE', entityType: 'Project', entityId: PR_ARCHIVADO, entityName: 'Migración legacy 2025 (archivado)', userId: P_ADMIN, details: null },
        { key: 'a8', h: 96, action: 'DELETE', entityType: 'Task', entityId: qaId('task:borrada'), entityName: 'Tarea eliminada de prueba', userId: P_SALES_2, details: null },
        { key: 'a9', h: 120, action: 'BULK_UPDATE', entityType: 'Task', entityId: null, entityName: null, userId: P_SALES_2, details: 'Updated 4 tasks' },
        { key: 'a10', h: 150, action: 'CREATE', entityType: 'Project', entityId: PR_PORTAL, entityName: 'Portal de clientes Andina', userId: P_ADMIN, details: null },
    ];

    for (const r of rows) {
        const { key, h, ...data } = r;
        await prisma.auditLog.upsert({
            where: { id: qaId(`audit:${key}`) },
            update: {},
            create: {
                id: qaId(`audit:${key}`), ...data,
                organizationId: ORG_A, ipAddress: '127.0.0.1',
                createdAt: new Date(ahora - h * HORA),
            },
        });
    }

    await prisma.auditLog.upsert({
        where: { id: qaId('audit:beta') },
        update: {},
        create: {
            id: qaId('audit:beta'), organizationId: ORG_B, userId: P_BETA_ADMIN,
            action: 'CREATE', entityType: 'Project', entityName: 'Proyecto Contoso (org B)',
            ipAddress: '127.0.0.1',
        },
    });

    const acciones = new Set(rows.map(r => r.action)).size;
    return `${rows.length} registros en org A (${acciones} acciones distintas) + 1 en org B`;
}
