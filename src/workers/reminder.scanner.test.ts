import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    findReminderDue, findDueSoon, markReminderSent, markDueReminderSent,
    findTasksDueSoon, markTaskDueReminderSent, findProjectsDueSoon, markProjectDueReminderSent,
    notify,
} = vi.hoisted(() => ({
    findReminderDue: vi.fn(),
    findDueSoon: vi.fn(),
    markReminderSent: vi.fn(),
    markDueReminderSent: vi.fn(),
    findTasksDueSoon: vi.fn(),
    markTaskDueReminderSent: vi.fn(),
    findProjectsDueSoon: vi.fn(),
    markProjectDueReminderSent: vi.fn(),
    notify: vi.fn(),
}));

vi.mock('../repositories/task.repository', () => ({
    TaskRepository: { findReminderDue, findDueSoon, markReminderSent, markDueReminderSent },
}));
vi.mock('../repositories/project.repository', () => ({
    ProjectRepository: { findTasksDueSoon, markTaskDueReminderSent, findProjectsDueSoon, markProjectDueReminderSent },
}));
vi.mock('../utils/notify', () => ({ notify }));

import { scanAndSendReminders } from './reminder.scanner';

function reminderTask(over: Record<string, unknown> = {}) {
    return {
        id: 't1', title: 'Llamar al cliente', organizationId: 'org-A', assignedTo: 'p1',
        dueDate: null, reminderDate: new Date('2026-01-01T09:00:00Z'),
        assignee: { id: 'p1', fullName: 'Ana', email: 'ana@test.local' },
        project: { name: 'Proyecto X' },
        ...over,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    findReminderDue.mockResolvedValue([]);
    findDueSoon.mockResolvedValue([]);
    findTasksDueSoon.mockResolvedValue([]);
    findProjectsDueSoon.mockResolvedValue([]);
    notify.mockResolvedValue(undefined);
    markReminderSent.mockResolvedValue({});
    markDueReminderSent.mockResolvedValue({});
    markTaskDueReminderSent.mockResolvedValue({});
    markProjectDueReminderSent.mockResolvedValue({});
});

describe('scanAndSendReminders', () => {
    it('por una tarea con reminderDate vencido: notifica TASK_DUE_SOON y marca reminderSent', async () => {
        findReminderDue.mockResolvedValue([reminderTask()]);

        const res = await scanAndSendReminders(new Date('2026-01-01T10:00:00Z'));

        expect(notify).toHaveBeenCalledTimes(1);
        const arg = notify.mock.calls[0][0];
        expect(arg.type).toBe('TASK_DUE_SOON');
        expect(arg.recipientUserId).toBe('p1');
        expect(arg.organizationId).toBe('org-A');
        expect(arg.entityId).toBe('t1');
        expect(arg.metadata).toMatchObject({ assigneeName: 'Ana', taskTitle: 'Llamar al cliente', projectName: 'Proyecto X' });
        expect(markReminderSent).toHaveBeenCalledWith('t1');
        expect(res.reminderSent).toBe(1);
    });

    it('por una tarea con dueDate en ventana: notifica y marca dueReminderSent', async () => {
        findDueSoon.mockResolvedValue([reminderTask({ id: 't2', reminderDate: null, dueDate: new Date('2026-01-01T20:00:00Z') })]);

        const res = await scanAndSendReminders(new Date('2026-01-01T10:00:00Z'));

        expect(notify).toHaveBeenCalledTimes(1);
        expect(markDueReminderSent).toHaveBeenCalledWith('t2');
        expect(markReminderSent).not.toHaveBeenCalled();
        expect(res.dueSent).toBe(1);
    });

    it('consulta dueSoon con un umbral posterior a now (ventana de anticipación)', async () => {
        const now = new Date('2026-01-01T10:00:00Z');
        await scanAndSendReminders(now);
        const threshold = findDueSoon.mock.calls[0][0] as Date;
        expect(threshold.getTime()).toBeGreaterThan(now.getTime());
    });

    it('si notify falla en una tarea, sigue procesando el resto y no marca esa', async () => {
        findReminderDue.mockResolvedValue([
            reminderTask({ id: 'ta' }),
            reminderTask({ id: 'tb' }),
        ]);
        notify.mockRejectedValueOnce(new Error('boom'));

        const res = await scanAndSendReminders(new Date('2026-01-01T10:00:00Z'));

        expect(notify).toHaveBeenCalledTimes(2);
        // 'ta' falló → no se marca; 'tb' ok → se marca
        expect(markReminderSent).toHaveBeenCalledWith('tb');
        expect(markReminderSent).not.toHaveBeenCalledWith('ta');
        expect(res.reminderSent).toBe(1);
    });

    it('tarea de PROYECTO con dueDate en ventana: notifica PROJECT_TASK_DUE_SOON y marca', async () => {
        findTasksDueSoon.mockResolvedValue([{
            id: 'pt1', title: 'Diseño', organizationId: 'org-A', assignedTo: 'p1',
            dueDate: new Date('2026-01-01T20:00:00Z'),
            assignee: { id: 'p1', fullName: 'Ana', email: 'ana@test.local' },
            project: { name: 'Proyecto X' },
        }]);

        const res = await scanAndSendReminders(new Date('2026-01-01T10:00:00Z'));

        const arg = notify.mock.calls[0][0];
        expect(arg.type).toBe('PROJECT_TASK_DUE_SOON');
        expect(arg.recipientUserId).toBe('p1');
        expect(markTaskDueReminderSent).toHaveBeenCalledWith('pt1');
        expect(res.projectTaskDueSent).toBe(1);
    });

    it('PROYECTO con endDate en ventana: notifica PROJECT_DUE al responsable y marca', async () => {
        findProjectsDueSoon.mockResolvedValue([{
            id: 'pr1', name: 'Proyecto X', organizationId: 'org-A', projectLeadId: 'lead1',
            endDate: new Date('2026-01-01T20:00:00Z'),
            projectLead: { id: 'lead1', fullName: 'Beto', email: 'beto@test.local' },
        }]);

        const res = await scanAndSendReminders(new Date('2026-01-01T10:00:00Z'));

        const arg = notify.mock.calls[0][0];
        expect(arg.type).toBe('PROJECT_DUE');
        expect(arg.recipientUserId).toBe('lead1');
        expect(arg.metadata.projectName).toBe('Proyecto X');
        expect(markProjectDueReminderSent).toHaveBeenCalledWith('pr1');
        expect(res.projectDueSent).toBe(1);
    });
});
