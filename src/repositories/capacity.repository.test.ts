import { describe, it, expect, vi, beforeEach } from 'vitest';
const { ptCount, tCount } = vi.hoisted(() => ({ ptCount: vi.fn(), tCount: vi.fn() }));
vi.mock('../config/prisma', () => ({
    prisma: { projectTask: { count: ptCount }, task: { count: tCount } },
}));
import { CapacityRepository } from './capacity.repository';
beforeEach(() => { vi.clearAllMocks(); ptCount.mockResolvedValue(0); tCount.mockResolvedValue(0); });

describe('CapacityRepository — aislamiento por organización', () => {
    it('countOpenTasks filtra por organizationId', async () => {
        await CapacityRepository.countOpenTasks('p1', 'org-A');
        for (const c of [ptCount, tCount]) {
            expect(c).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ assignedTo: 'p1', organizationId: 'org-A' }),
            }));
        }
    });
    it('countOverdueTasks filtra por organizationId', async () => {
        await CapacityRepository.countOverdueTasks('p1', 'org-A', new Date(0));
        for (const c of [ptCount, tCount]) {
            expect(c).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ assignedTo: 'p1', organizationId: 'org-A' }),
            }));
        }
    });
});
