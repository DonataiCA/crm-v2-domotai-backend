import { prisma } from '../config/prisma';
import { Request } from 'express';

interface AuditEntry {
    action: string;        // CREATE, UPDATE, DELETE, ARCHIVE, RESTORE, LOGIN, SHARE
    entityType: string;    // Project, Lead, Contact, Invoice, Task, User, Organization
    entityId?: string;
    entityName?: string;
    details?: string;
}

export async function logAudit(req: Request, entry: AuditEntry): Promise<void> {
    try {
        const userId = (req as any).userId || null;
        const organizationId = req.headers['x-organization-id'] as string || null;
        const ipAddress = req.ip || (req.connection as any)?.remoteAddress || null;

        if (!organizationId) return; // Can't log without org context

        await prisma.auditLog.create({
            data: {
                organizationId,
                userId,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId || null,
                entityName: entry.entityName || null,
                details: entry.details || null,
                ipAddress,
            },
        });
    } catch (error) {
        // Audit logging should never break the request
        console.error('[AUDIT] Failed to write audit log:', error);
    }
}
