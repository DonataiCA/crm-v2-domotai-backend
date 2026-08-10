import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { prisma } from '../config/prisma';
import { emailService } from '../utils/email';

export const DashboardController = {
    commercial: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const pipelineId = req.query.pipelineId as string;
            const dateFrom = req.query.dateFrom as string;
            const dateTo = req.query.dateTo as string;

            // Get all pipelines with stages
            const pipelines = await prisma.pipeline.findMany({
                where: { organizationId },
                include: { stages: { orderBy: { order: 'asc' } } },
            });

            const activePipeline = pipelineId
                ? pipelines.find(p => p.id === pipelineId) || pipelines[0]
                : pipelines.find(p => p.isDefault) || pipelines[0];

            if (!activePipeline) {
                return res.json({ pipeline: null, pipelines: [], stageStats: [], totals: {} });
            }

            const dateFilter: any = {};
            if (dateFrom) dateFilter.gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                dateFilter.lte = end;
            }

            const leads = await prisma.lead.findMany({
                where: {
                    organizationId,
                    pipelineId: activePipeline.id,
                    ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
                },
                include: {
                    company: { select: { id: true, name: true } },
                    contact: { select: { id: true, name: true } },
                },
            });

            const stageMap = new Map(activePipeline.stages.map(s => [s.name, s]));

            const stageStats = activePipeline.stages.map(stage => {
                const stageLeads = leads.filter(l => l.stage === stage.name);
                const companiesSet = new Map<string, string>();
                stageLeads.forEach(l => {
                    if (l.company) companiesSet.set(l.company.id, l.company.name);
                });
                return {
                    stageId: stage.id,
                    stageName: stage.name,
                    stageColor: stage.color,
                    stageOrder: stage.order,
                    stageCategory: stage.category,
                    stageWeight: stage.weight,
                    leadCount: stageLeads.length,
                    totalAmount: stageLeads.reduce((sum, l) => sum + (Number(l.price) || 0), 0),
                    companyCount: companiesSet.size,
                    companies: Array.from(companiesSet.entries()).map(([id, name]) => ({ id, name })),
                };
            });

            const totalLeads = leads.length;
            const closedWonLeads = leads.filter(l => {
                const stg = stageMap.get(l.stage || '');
                return (stg && stg.category === 'won') || l.converted;
            });
            const closedWon = closedWonLeads.length;
            const totalRevenue = closedWonLeads.reduce((s, l) => s + (Number(l.price) || 0), 0);
            const closedLost = leads.filter(l => {
                const stg = stageMap.get(l.stage || '');
                return stg && stg.category === 'lost';
            }).length;
            const closedTotal = closedWon + closedLost;
            const closeRate = closedTotal > 0 ? Math.round((closedWon / closedTotal) * 100) : 0;

            res.json({
                pipeline: { id: activePipeline.id, name: activePipeline.name },
                pipelines: pipelines.map(p => ({ id: p.id, name: p.name })),
                stageStats,
                totals: {
                    totalLeads,
                    closedWon,
                    totalRevenue,
                    closeRate,
                    totalAmount: leads
                        .filter(l => {
                            const stg = stageMap.get(l.stage || '');
                            return !stg || stg.category !== 'lost';
                        })
                        .reduce((s, l) => s + (Number(l.price) || 0), 0),
                    closedWonAmount: closedWonLeads.reduce((s, l) => s + (Number(l.price) || 0), 0),
                    weightedProjection: leads
                        .filter(l => {
                            const stg = stageMap.get(l.stage || '');
                            return stg && stg.category !== 'lost' && stg.weight > 0;
                        })
                        .reduce((s, l) => {
                            const stg = stageMap.get(l.stage || '');
                            return s + (Number(l.price) || 0) * ((stg?.weight || 50) / 100);
                        }, 0),
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch commercial dashboard', error);
        }
    },

    operational: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const projects = await prisma.project.findMany({
                where: { organizationId },
                select: {
                    id: true, name: true, status: true, startDate: true, endDate: true,
                    _count: { select: { tasks: true, phases: true } },
                },
            });

            const projectsByStatus: Record<string, number> = {};
            projects.forEach(p => {
                const status = p.status || 'Not Started';
                projectsByStatus[status] = (projectsByStatus[status] || 0) + 1;
            });

            const activeProjectIds = projects
                .filter(p => p.status === 'In Progress' || p.status === 'active')
                .map(p => p.id);

            const taskStats = activeProjectIds.length > 0
                ? await prisma.projectTask.groupBy({
                    by: ['status'],
                    where: { projectId: { in: activeProjectIds } },
                    _count: true,
                })
                : [];

            const overdueTasks = activeProjectIds.length > 0
                ? await prisma.projectTask.count({
                    where: {
                        projectId: { in: activeProjectIds },
                        status: { not: 'COMPLETED' },
                        dueDate: { lt: new Date() },
                    },
                })
                : 0;

            res.json({
                projects: projects.map(p => ({
                    id: p.id, name: p.name, status: p.status,
                    taskCount: p._count.tasks, phaseCount: p._count.phases,
                    startDate: p.startDate, endDate: p.endDate,
                })),
                projectsByStatus,
                taskStats: taskStats.map(t => ({ status: t.status, count: t._count })),
                overdueTasks,
                totalProjects: projects.length,
                activeProjects: activeProjectIds.length,
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch operational dashboard', error);
        }
    },

    weeklyDigest: async (req: Request, res: Response) => {
        try {
            // Get first org (single-tenant)
            const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
            if (!org) return sendError(res, 404, 'No organization found');

            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            const [newLeads, wonLeads, lostLeads, overdueTasks, topLeads, teamMembers] = await Promise.all([
                prisma.lead.count({ where: { organizationId: org.id, createdAt: { gte: oneWeekAgo }, deletedAt: null } }),
                prisma.lead.findMany({
                    where: { organizationId: org.id, updatedAt: { gte: oneWeekAgo }, stage: { in: ['Closed Won', 'Won', 'closed_won'] } },
                    select: { price: true },
                }),
                prisma.lead.count({ where: { organizationId: org.id, updatedAt: { gte: oneWeekAgo }, stage: { in: ['Closed Lost', 'Lost', 'closed_lost'] } } }),
                prisma.task.count({ where: { organizationId: org.id, status: { not: 'COMPLETED' }, dueDate: { lt: new Date() } } }),
                prisma.lead.findMany({
                    where: { organizationId: org.id, deletedAt: null, stage: { notIn: ['Closed Lost', 'Lost', 'closed_lost'] } },
                    orderBy: { price: 'desc' },
                    take: 5,
                    include: { company: { select: { name: true } } },
                }),
                prisma.organizationMember.findMany({
                    where: { organizationId: org.id },
                    include: { profile: { select: { email: true, fullName: true, role: true } } },
                }),
            ]);

            const wonValue = wonLeads.reduce((s, l) => s + Number(l.price || 0), 0);
            const wonCount = wonLeads.length;

            const topLeadRows = topLeads.map(l =>
                `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${l.name || 'Unnamed'}</td>` +
                `<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${l.stage}</td>` +
                `<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;">$${Number(l.price || 0).toLocaleString()}</td>` +
                `<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${l.company?.name || '-'}</td></tr>`
            ).join('');

            // Send to team members (salesman, admin, freelancer)
            const recipients = teamMembers
                .filter(m => ['salesman', 'admin', 'freelancer'].includes(m.profile?.role || ''))
                .map(m => m.profile?.email)
                .filter(Boolean) as string[];

            let sent = 0;
            for (const email of recipients) {
                const success = await emailService.sendWeeklyDigest(email, {
                    orgName: org.name,
                    newLeads,
                    wonCount,
                    wonValue,
                    lostLeads,
                    overdueTasks,
                    topLeadRows,
                });
                if (success) sent++;
            }

            res.json({ sent, total: recipients.length });
        } catch (error) {
            return sendError(res, 500, 'Failed to send weekly digest', error);
        }
    },
};
