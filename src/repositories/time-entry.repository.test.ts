import { describe, it, expect, vi, beforeEach } from 'vitest';

const { teFindFirst, teFindUnique, teUpdateMany } = vi.hoisted(() => ({
    teFindFirst: vi.fn(), teFindUnique: vi.fn(), teUpdateMany: vi.fn(),
}));
vi.mock('../config/prisma', () => ({
    prisma: { timeEntry: { findFirst: teFindFirst, findUnique: teFindUnique, updateMany: teUpdateMany, update: vi.fn() } },
}));

import { TimeEntryRepository } from './time-entry.repository';
beforeEach(() => { vi.clearAllMocks(); });

describe('TimeEntryRepository.stopTimer — aislamiento por organización', () => {
    it('acota la lectura por organización cuando se pasa orgId', async () => {
        teFindFirst.mockResolvedValue(null); // no es de la org
        const result = await TimeEntryRepository.stopTimer('te-ajeno', 'org-A');
        expect(teFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 'te-ajeno', organizationId: 'org-A' }),
        }));
        expect(result).toBeNull();
        expect(teUpdateMany).not.toHaveBeenCalled();
    });
});
