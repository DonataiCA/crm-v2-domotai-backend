import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { prisma } from '../config/prisma';

export const AnalyticsController = {
    keyMetrics: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const [customersCount, activeDealsCount, totalLeads, convertedLeads, revenueAgg] = await Promise.all([
                prisma.contact.count({ where: { organizationId, deletedAt: null } }),
                prisma.lead.count({ where: { organizationId, converted: false, stage: { notIn: ['closed_lost'] } } }),
                prisma.lead.count({ where: { organizationId } }),
                prisma.lead.count({ where: { organizationId, stage: 'closed_won' } }),
                prisma.project.aggregate({ where: { organizationId }, _sum: { revenue: true } }),
            ]);

            const winRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

            res.json({
                customersCount,
                activeDealsCount,
                totalRevenue: Number(revenueAgg._sum.revenue || 0),
                winRate,
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch key metrics', error);
        }
    },

    salesOverview: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            // Return revenue grouped by project status as chart data
            const projects = await prisma.project.findMany({
                where: { organizationId },
                select: { status: true, revenue: true, price: true, createdAt: true },
                orderBy: { createdAt: 'asc' },
            });

            // Group by month
            const monthMap = new Map<string, number>();
            for (const p of projects) {
                const month = p.createdAt.toISOString().substring(0, 7); // YYYY-MM
                monthMap.set(month, (monthMap.get(month) || 0) + Number(p.revenue || p.price || 0));
            }

            const data = Array.from(monthMap.entries()).map(([month, revenue]) => ({
                month,
                revenue,
            }));

            res.json(data);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch sales overview', error);
        }
    },

    revenueByClient: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const contacts = await prisma.contact.findMany({
                where: { organizationId, deletedAt: null },
                select: { name: true, totalRevenue: true },
                orderBy: { totalRevenue: 'desc' },
                take: 10,
            });

            // Return as array with name + total_revenue for BarChart dataKey
            res.json(contacts.map(c => ({
                name: c.name,
                total_revenue: Number(c.totalRevenue || 0),
            })));
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch revenue by client', error);
        }
    },

    freelancerCommissions: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const projects = await prisma.project.findMany({
                where: { organizationId },
                select: {
                    revenue: true,
                    commissionPaid: true,
                    createdAt: true,
                    projectLead: { select: { commissionRate: true } },
                },
                orderBy: { createdAt: 'asc' },
            });

            // Group commissions by month for AreaChart
            const monthMap = new Map<string, number>();
            for (const p of projects) {
                if (!p.commissionPaid && p.projectLead) {
                    const month = p.createdAt.toISOString().substring(0, 7);
                    const commission = Number(p.revenue || 0) * (Number(p.projectLead.commissionRate) / 100);
                    monthMap.set(month, (monthMap.get(month) || 0) + commission);
                }
            }

            const data = Array.from(monthMap.entries()).map(([month, commissions]) => ({
                month,
                commissions,
            }));

            res.json(data);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch freelancer commissions', error);
        }
    },

    leadConversion: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const [totalLeads, convertedLeads] = await Promise.all([
                prisma.lead.count({ where: { organizationId } }),
                prisma.lead.count({ where: { organizationId, converted: true } }),
            ]);

            // Return as array for PieChart: [{ name, value }]
            res.json([
                { name: 'Converted', value: convertedLeads },
                { name: 'Not Converted', value: totalLeads - convertedLeads },
            ]);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch lead conversion data', error);
        }
    },
};
