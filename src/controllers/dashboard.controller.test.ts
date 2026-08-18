import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mismo patrón que lead.controller.test.ts: vi.mock se hoistea, así que los
// mocks se declaran con vi.hoisted().
const { pipelineFindMany, leadFindMany } = vi.hoisted(() => ({
    pipelineFindMany: vi.fn(),
    leadFindMany: vi.fn(),
}));

vi.mock('../config/prisma', () => ({
    prisma: {
        pipeline: { findMany: pipelineFindMany },
        lead: { findMany: leadFindMany },
    },
}));

vi.mock('../utils/email', () => ({ emailService: { sendWeeklyDigest: vi.fn() } }));

import { DashboardController } from './dashboard.controller';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        headers: { 'x-organization-id': 'org-A' },
        params: {}, query: {}, body: {}, orgId: 'org-A', userId: 'u1',
        ...overrides,
    } as any;
}

function fakeRes() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

beforeEach(() => { vi.clearAllMocks(); });

/**
 * Las etapas guardan `name` para mostrar ("Negociación") y `slug` para
 * almacenar ("negociacion"). Desde la migración add_catalog_checks, la columna
 * leads.stage está restringida a `^[a-z0-9_]+$`, es decir SIEMPRE el slug.
 *
 * El dashboard cruzaba los leads contra `stage.name`, que nunca coincide con
 * un slug cuando el nombre lleva mayúscula o acento. Resultado: cero leads en
 * todas las etapas y proyección ponderada nula.
 */
const STAGES = [
    { id: 's1', name: 'Nuevo', slug: 'nuevo', color: '#64748b', order: 0, category: 'standard', weight: 10 },
    { id: 's2', name: 'Negociación', slug: 'negociacion', color: '#f59e0b', order: 1, category: 'standard', weight: 80 },
    { id: 's3', name: 'Ganado', slug: 'ganado', color: '#10b981', order: 2, category: 'won', weight: 100 },
    { id: 's4', name: 'Perdido', slug: 'perdido', color: '#ef4444', order: 3, category: 'lost', weight: 0 },
];

const PIPELINE = { id: 'p1', name: 'Comercial', isDefault: true, stages: STAGES };

/** Leads tal y como los guarda la base hoy: por slug. */
const LEADS = [
    { id: 'l1', stage: 'nuevo', price: 1000, converted: false, company: null, contact: null },
    { id: 'l2', stage: 'negociacion', price: 2000, converted: false, company: { id: 'c1', name: 'Andina' }, contact: null },
    { id: 'l3', stage: 'negociacion', price: 3000, converted: false, company: { id: 'c2', name: 'Norte' }, contact: null },
    { id: 'l4', stage: 'ganado', price: 5000, converted: true, company: null, contact: null },
    { id: 'l5', stage: 'perdido', price: 9000, converted: false, company: null, contact: null },
];

async function runCommercial() {
    pipelineFindMany.mockResolvedValue([PIPELINE]);
    leadFindMany.mockResolvedValue(LEADS);
    const res = fakeRes();
    await DashboardController.commercial(fakeReq(), res);
    return res.json.mock.calls[0][0];
}

describe('DashboardController.commercial — cruce de etapas por slug', () => {
    it('cuenta los leads en la etapa que les corresponde', async () => {
        const body = await runCommercial();
        const porNombre = Object.fromEntries(
            body.stageStats.map((s: any) => [s.stageName, s.leadCount]),
        );

        expect(porNombre['Nuevo']).toBe(1);
        expect(porNombre['Negociación']).toBe(2);
        expect(porNombre['Ganado']).toBe(1);
        expect(porNombre['Perdido']).toBe(1);
    });

    it('suma los importes de cada etapa', async () => {
        const body = await runCommercial();
        const negociacion = body.stageStats.find((s: any) => s.stageName === 'Negociación');
        expect(negociacion.totalAmount).toBe(5000);
        expect(negociacion.companyCount).toBe(2);
    });

    it('reconoce las etapas perdidas para la tasa de cierre', async () => {
        const body = await runCommercial();
        // 1 ganado y 1 perdido → 50 %
        expect(body.totals.closedWon).toBe(1);
        expect(body.totals.closeRate).toBe(50);
    });

    it('excluye los leads perdidos del importe total en pipeline', async () => {
        const body = await runCommercial();
        // 1000 + 2000 + 3000 + 5000 = 11000; los 9000 del perdido quedan fuera
        expect(body.totals.totalAmount).toBe(11000);
    });

    it('pondera la proyección por el peso de la etapa', async () => {
        const body = await runCommercial();
        // 1000×10% + 2000×80% + 3000×80% + 5000×100% = 100 + 1600 + 2400 + 5000
        expect(Math.round(body.totals.weightedProjection)).toBe(9100);
    });

    it('mantiene el nombre legible de la etapa en la respuesta', async () => {
        const body = await runCommercial();
        // El slug es para cruzar; la interfaz sigue recibiendo el nombre.
        expect(body.stageStats.map((s: any) => s.stageName))
            .toEqual(['Nuevo', 'Negociación', 'Ganado', 'Perdido']);
    });
});
