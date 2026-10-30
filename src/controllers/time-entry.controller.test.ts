import { describe, it, expect, vi, beforeEach } from 'vitest';

const { create, startTimer } = vi.hoisted(() => ({
    create: vi.fn(),
    startTimer: vi.fn(),
}));

vi.mock('../repositories/time-entry.repository', () => ({
    TimeEntryRepository: { create, startTimer },
}));

import { TimeEntryController } from './time-entry.controller';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        params: {},
        query: {},
        body: {},
        orgId: 'org-A',
        userId: 'user-1',
        user: { profileId: 'prof-1', role: 'freelancer' },
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

// TimeEntry.userId es FK a profiles.id; guardar el User.id daba 500 por FK a
// los usuarios cuyo Profile.id no coincide con su User.id.
describe('TimeEntryController: dueño de la entrada', () => {
    it('create asigna la entrada al Profile.id del usuario', async () => {
        create.mockResolvedValue({ id: 'e1' });
        await TimeEntryController.create(
            fakeReq({ body: { startTime: '2026-10-30T10:00:00Z', description: 'x' } }), fakeRes(),
        );
        expect(create.mock.calls[0][0].userId).toBe('prof-1');
    });

    it('start asigna el temporizador al Profile.id del usuario', async () => {
        startTimer.mockResolvedValue({ id: 'e1' });
        await TimeEntryController.start(fakeReq({ body: {} }), fakeRes());
        expect(startTimer.mock.calls[0][0].userId).toBe('prof-1');
    });

    it('el cliente no puede imputar horas a otro usuario mandando userId en el body', async () => {
        create.mockResolvedValue({ id: 'e1' });
        await TimeEntryController.create(
            fakeReq({ body: { startTime: '2026-10-30T10:00:00Z', userId: 'prof-otro' } }), fakeRes(),
        );
        expect(create.mock.calls[0][0].userId).toBe('prof-1');
    });
});
