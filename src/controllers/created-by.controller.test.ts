import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Todas las columnas `createdBy` del schema son FK a Profile.id. Varios
 * controladores guardaban `req.userId` (el User.id del JWT): funcionaba solo
 * para los usuarios migrados, cuyos dos ids coinciden, y daba 500 por FK a los
 * creados con admin-create. Aquí se fija la autoría de cada alta afectada.
 */
const m = vi.hoisted(() => ({
    calendarCreate: vi.fn(),
    companyCreate: vi.fn(),
    contactCreate: vi.fn(),
    contactFindById: vi.fn(),
    contactAddNote: vi.fn(),
    contactAddFileLink: vi.fn(),
    leadFindById: vi.fn(),
    leadAddEvent: vi.fn(),
    orgCreate: vi.fn(),
}));

vi.mock('../repositories/calendar.repository', () => ({
    CalendarRepository: { create: m.calendarCreate },
}));
vi.mock('../repositories/company.repository', () => ({
    CompanyRepository: { create: m.companyCreate },
}));
vi.mock('../repositories/contact.repository', () => ({
    ContactRepository: {
        create: m.contactCreate,
        findById: m.contactFindById,
        addNote: m.contactAddNote,
        addFileLink: m.contactAddFileLink,
    },
}));
vi.mock('../repositories/lead.repository', () => ({
    LeadRepository: { findById: m.leadFindById, addEvent: m.leadAddEvent },
}));
vi.mock('../repositories/organization.repository', () => ({
    OrganizationRepository: { create: m.orgCreate },
}));
vi.mock('../config/prisma', () => ({ prisma: {} }));
vi.mock('../utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('../utils/notify', () => ({ notify: vi.fn() }));

import { CalendarController } from './calendar.controller';
import { CompanyController } from './company.controller';
import { ContactController } from './contact.controller';
import { LeadController } from './lead.controller';
import { OrganizationController } from './organization.controller';

function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        params: {},
        query: {},
        body: {},
        orgId: 'org-A',
        userId: 'user-1',
        user: { profileId: 'prof-1', role: 'salesman' },
        ...overrides,
    } as any;
}

function fakeRes() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    res.sendStatus = vi.fn(() => res);
    return res;
}

beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(m)) fn.mockResolvedValue({ id: 'x1', name: 'X' });
});

describe('createdBy usa el Profile.id', () => {
    it('CalendarController.create', async () => {
        await CalendarController.create(
            fakeReq({ body: { title: 'Reunión', startDate: '2026-10-30T10:00:00Z' } }), fakeRes(),
        );
        expect(m.calendarCreate.mock.calls[0][0].createdBy).toBe('prof-1');
    });

    it('CompanyController.create', async () => {
        await CompanyController.create(fakeReq({ body: { name: 'Acme' } }), fakeRes());
        expect(m.companyCreate.mock.calls[0][0].createdBy).toBe('prof-1');
    });

    it('ContactController.create', async () => {
        await ContactController.create(fakeReq({ body: { name: 'Ana' } }), fakeRes());
        expect(m.contactCreate.mock.calls[0][0].createdBy).toBe('prof-1');
    });

    it('ContactController.addNote', async () => {
        await ContactController.addNote(
            fakeReq({ params: { contactId: 'c1' }, body: { note: 'hola' } }), fakeRes(),
        );
        expect(m.contactAddNote.mock.calls[0][0].createdBy).toBe('prof-1');
    });

    it('ContactController.addFileLink', async () => {
        await ContactController.addFileLink(
            fakeReq({ params: { contactId: 'c1' }, body: { title: 'Doc', url: 'https://x.test' } }), fakeRes(),
        );
        expect(m.contactAddFileLink.mock.calls[0][0].createdBy).toBe('prof-1');
    });

    it('LeadController.addEvent', async () => {
        await LeadController.addEvent(
            fakeReq({ params: { leadId: 'l1' }, body: { eventType: 'call', description: 'x' } }), fakeRes(),
        );
        expect(m.leadAddEvent.mock.calls[0][0].createdBy).toBe('prof-1');
    });

    it('OrganizationController.create', async () => {
        await OrganizationController.create(fakeReq({ body: { name: 'Org' } }), fakeRes());
        expect(m.orgCreate.mock.calls[0][0].createdBy).toBe('prof-1');
    });
});
