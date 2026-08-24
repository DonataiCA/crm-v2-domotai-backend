import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` es hoisted al inicio del archivo, así que las variables que
// referencia deben venir de `vi.hoisted()` — mismo motivo que en
// lead.repository.test.ts.
const { projectFindMany, phaseFindMany } = vi.hoisted(() => ({
    projectFindMany: vi.fn(),
    phaseFindMany: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        project: { findMany: projectFindMany },
        projectPhase: { findMany: phaseFindMany },
        calendarEvent: {
            findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
        },
    },
}));

import { CalendarRepository } from './calendar.repository';

const FROM = new Date('2026-08-01T00:00:00.000Z');
const TO = new Date('2026-08-31T23:59:59.999Z');

beforeEach(() => { vi.clearAllMocks(); });

describe('CalendarRepository.findProjectMilestones', () => {
    it('acepta el proyecto por su inicio o por su fin, no por solapamiento', async () => {
        projectFindMany.mockResolvedValue([]);

        await CalendarRepository.findProjectMilestones('org-A', FROM, TO);

        const { where } = projectFindMany.mock.calls[0][0];
        expect(where.OR).toEqual([
            { startDate: { gte: FROM, lte: TO } },
            { endDate: { gte: FROM, lte: TO } },
        ]);
    });

    it('acota a la organización y descarta los proyectos archivados', async () => {
        projectFindMany.mockResolvedValue([]);

        await CalendarRepository.findProjectMilestones('org-A', FROM, TO);

        const { where } = projectFindMany.mock.calls[0][0];
        expect(where.organizationId).toBe('org-A');
        expect(where.status).toEqual({ not: 'ARCHIVED' });
    });
});

describe('CalendarRepository.findPhaseMilestones', () => {
    it('aísla por organización a través de la relación project', async () => {
        // `ProjectPhase` no tiene `organizationId` propio: si este filtro
        // desaparece, la consulta devuelve fases de otras organizaciones.
        phaseFindMany.mockResolvedValue([]);

        await CalendarRepository.findPhaseMilestones('org-A', FROM, TO);

        const { where } = phaseFindMany.mock.calls[0][0];
        expect(where.project).toEqual({ organizationId: 'org-A', status: { not: 'ARCHIVED' } });
    });

    it('trae el proyecto al que pertenece cada fase', async () => {
        phaseFindMany.mockResolvedValue([]);

        await CalendarRepository.findPhaseMilestones('org-A', FROM, TO);

        const { select } = phaseFindMany.mock.calls[0][0];
        expect(select.project).toEqual({ select: { id: true, name: true } });
    });
});
