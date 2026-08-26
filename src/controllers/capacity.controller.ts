import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { CapacityRepository } from '../repositories/capacity.repository';

const HOURS_PER_DAY = 8;
const WORK_DAYS = 5;
const AVAILABLE_HOURS = HOURS_PER_DAY * WORK_DAYS; // 40
const HOURS_PER_OPEN_TASK = 4; // heuristic for "planned hours"

function getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function classifyBucket(utilizationPercent: number): 'available' | 'healthy' | 'tight' | 'overloaded' {
    if (utilizationPercent >= 100) return 'overloaded';
    if (utilizationPercent >= 80) return 'tight';
    if (utilizationPercent >= 50) return 'healthy';
    return 'available';
}

export const CapacityController = {
    /**
     * GET /capacity/week?weekStart=YYYY-MM-DD
     * Returns rich workload data per team member for the given week.
     */
    week: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId || (req.headers['x-organization-id'] as string);
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const weekStartParam = req.query.weekStart as string | undefined;
            const weekStart = weekStartParam ? getMonday(new Date(weekStartParam)) : getMonday(new Date());
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);
            const now = new Date();

            const teamMembers = await CapacityRepository.getTeamMembers(orgId);

            const rows = await Promise.all(
                teamMembers.map(async (member) => {
                    const profileId = member.profile.id;

                    const [openTaskCount, overdueTaskCount, loggedHoursWeek, activeProjectCount] = await Promise.all([
                        CapacityRepository.countOpenTasks(profileId, orgId),
                        CapacityRepository.countOverdueTasks(profileId, orgId, now),
                        CapacityRepository.sumLoggedHours(profileId, orgId, weekStart, weekEnd),
                        CapacityRepository.countActiveProjects(profileId, orgId),
                    ]);

                    const plannedHours = openTaskCount * HOURS_PER_OPEN_TASK;
                    const utilizationPercent = Math.round((plannedHours / AVAILABLE_HOURS) * 100);
                    const bucket = classifyBucket(utilizationPercent);

                    return {
                        userId: profileId,
                        fullName: member.profile.fullName,
                        email: member.profile.email,
                        role: member.profile.role,
                        openTaskCount,
                        overdueTaskCount,
                        plannedHours,
                        availableHours: AVAILABLE_HOURS,
                        utilizationPercent,
                        loggedHoursWeek,
                        activeProjectCount,
                        bucket,
                    };
                }),
            );

            // Sort by utilization desc so most loaded appear first
            rows.sort((a, b) => b.utilizationPercent - a.utilizationPercent);

            const totals = {
                members: rows.length,
                overloaded: rows.filter(r => r.bucket === 'overloaded').length,
                tight: rows.filter(r => r.bucket === 'tight').length,
                available: rows.filter(r => r.bucket === 'available').length,
            };

            res.json({
                weekStart: weekStart.toISOString(),
                weekEnd: weekEnd.toISOString(),
                hoursPerDay: HOURS_PER_DAY,
                workDays: WORK_DAYS,
                rows,
                totals,
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch capacity data', error);
        }
    },

    /**
     * GET /capacity/workload/:userId
     * Returns per-project task breakdown + upcoming deadlines for one user.
     */
    workloadDetail: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId || (req.headers['x-organization-id'] as string);
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const { userId } = req.params; // this is profileId
            const now = new Date();

            const [tasksByProject, upcomingTasks, projectLeadCount] = await Promise.all([
                CapacityRepository.tasksByProject(userId, orgId, now),
                CapacityRepository.upcomingTasks(userId, orgId, now, 10),
                CapacityRepository.countProjectLead(userId, orgId),
            ]);

            res.json({
                userId,
                projectLeadCount,
                tasksByProject,
                upcomingTasks,
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch workload detail', error);
        }
    },
};
