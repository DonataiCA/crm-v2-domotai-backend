import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.hoisted(() => vi.fn());
vi.mock('../config/prisma', () => ({ prisma: { auditLog: { create } } }));

import { logAudit } from './audit';

beforeEach(() => vi.clearAllMocks());

/**
 * `audit_logs.userId` es FK a `profiles.id`. Escribir ahí el User.id (`req.userId`)
 * violaba la FK para todo usuario con Profile.id ≠ User.id —los creados por
 * admin-create, es decir, los de producción— y `logAudit` se tragaba el error: la
 * entrada se perdía sin que nadie se enterara.
 */
describe('logAudit', () => {
    it('registra al autor por su Profile.id, no por su User.id', async () => {
        const req: any = {
            userId: 'user-1',
            user: { profileId: 'prof-1', role: 'freelancer' },
            headers: { 'x-organization-id': 'org-A' },
            ip: '127.0.0.1',
        };
        await logAudit(req, { action: 'IMPORT', entityType: 'Project', entityId: 'p1' });
        expect(create).toHaveBeenCalledWith({
            data: expect.objectContaining({ organizationId: 'org-A', userId: 'prof-1', action: 'IMPORT' }),
        });
    });

    it('sin usuario autenticado (login fallido, portal) deja el autor vacío', async () => {
        const req: any = { headers: { 'x-organization-id': 'org-A' } };
        await logAudit(req, { action: 'LOGIN', entityType: 'User' });
        expect(create.mock.calls[0][0].data.userId).toBeNull();
    });
});
