import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock se hoistea al inicio del archivo, así que los mocks vienen de
// vi.hoisted() — mismo motivo que en project.controller.test.ts.
const { findAll, findProjectMilestones, findPhaseMilestones } = vi.hoisted(() => ({
    findAll: vi.fn(),
    findProjectMilestones: vi.fn(),
    findPhaseMilestones: vi.fn(),
}));

vi.mock('../repositories/calendar.repository', () => ({
    CalendarRepository: { findAll, findProjectMilestones, findPhaseMilestones },
}));

import { CalendarController } from './calendar.controller';

function fakeReq(query: Record<string, unknown>) {
    return { params: {}, body: {}, query, orgId: 'org-A' } as any;
}

function fakeRes() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    res.sendStatus = vi.fn(() => res);
    return res;
}

const AGOSTO = { dateFrom: '2026-08-01', dateTo: '2026-08-31' };

beforeEach(() => {
    vi.clearAllMocks();
    findAll.mockResolvedValue([]);
    findProjectMilestones.mockResolvedValue([]);
    findPhaseMilestones.mockResolvedValue([]);
});

describe('CalendarController.overview', () => {
    it('desdobla cada proyecto en un hito de inicio y otro de fin', async () => {
        findProjectMilestones.mockResolvedValue([{
            id: 'p1', name: 'Portal', status: 'IN_PROGRESS',
            startDate: new Date('2026-08-03T00:00:00.000Z'),
            endDate: new Date('2026-08-20T00:00:00.000Z'),
        }]);
        const res = fakeRes();

        await CalendarController.overview(fakeReq(AGOSTO), res);

        const { projects } = res.json.mock.calls[0][0];
        expect(projects.map((m: any) => m.kind)).toEqual(['project-start', 'project-end']);
        expect(projects[0]).toMatchObject({ refId: 'p1', projectId: 'p1', title: 'Portal' });
    });

    it('descarta el extremo que cae fuera del rango consultado', async () => {
        // La query trae el registro si su inicio *o* su fin entra en el mes; el
        // otro extremo puede quedar fuera y no debe pintarse.
        findProjectMilestones.mockResolvedValue([{
            id: 'p1', name: 'Portal', status: 'IN_PROGRESS',
            startDate: new Date('2026-05-10T00:00:00.000Z'),
            endDate: new Date('2026-08-20T00:00:00.000Z'),
        }]);
        const res = fakeRes();

        await CalendarController.overview(fakeReq(AGOSTO), res);

        const { projects } = res.json.mock.calls[0][0];
        expect(projects).toHaveLength(1);
        expect(projects[0].kind).toBe('project-end');
    });

    it('incluye lo que ocurre durante el último día del mes', async () => {
        // 'dateTo' llega sin hora: interpretado a medianoche dejaría fuera todo
        // el día 31.
        findProjectMilestones.mockResolvedValue([{
            id: 'p1', name: 'Portal', status: 'IN_PROGRESS',
            startDate: null,
            endDate: new Date('2026-08-31T18:00:00.000Z'),
        }]);
        const res = fakeRes();

        await CalendarController.overview(fakeReq(AGOSTO), res);

        expect(res.json.mock.calls[0][0].projects).toHaveLength(1);
    });

    it('atribuye la fase a su proyecto, no a sí misma', async () => {
        findPhaseMilestones.mockResolvedValue([{
            id: 'ph1', name: 'Diseño', status: 'active',
            startDate: new Date('2026-08-05T00:00:00.000Z'),
            endDate: null,
            projectId: 'p1',
            project: { id: 'p1', name: 'Portal' },
        }]);
        const res = fakeRes();

        await CalendarController.overview(fakeReq(AGOSTO), res);

        const { phases } = res.json.mock.calls[0][0];
        expect(phases[0]).toMatchObject({
            kind: 'phase-start', refId: 'ph1', projectId: 'p1', title: 'Diseño', projectName: 'Portal',
        });
    });

    it('no consulta las fuentes que el cliente no pidió', async () => {
        const res = fakeRes();

        await CalendarController.overview(fakeReq({ ...AGOSTO, sources: 'events,projects' }), res);

        expect(findProjectMilestones).toHaveBeenCalled();
        expect(findPhaseMilestones).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].phases).toEqual([]);
    });

    it('pide siempre los hitos acotados a la organización del request', async () => {
        const res = fakeRes();

        await CalendarController.overview(fakeReq(AGOSTO), res);

        expect(findProjectMilestones).toHaveBeenCalledWith('org-A', expect.any(Date), expect.any(Date));
        expect(findPhaseMilestones).toHaveBeenCalledWith('org-A', expect.any(Date), expect.any(Date));
    });
});
