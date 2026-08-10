import { prisma } from '../config/prisma';

export const FinancialRepository = {
    getDashboard: async (orgId: string) => {
        // Total revenue from paid invoices
        const revenueResult = await prisma.invoice.aggregate({
            where: { organizationId: orgId, status: 'PAID' },
            _sum: { total: true },
        });
        const totalRevenue = Number(revenueResult._sum.total ?? 0);

        // Total expenses from billable time entries (hours * hourlyRate)
        const timeEntries = await prisma.timeEntry.findMany({
            where: { organizationId: orgId, billable: true, hourlyRate: { not: null } },
            select: { durationMinutes: true, hourlyRate: true },
        });
        const totalExpenses = timeEntries.reduce((sum, te) => {
            const hours = (te.durationMinutes ?? 0) / 60;
            const rate = Number(te.hourlyRate ?? 0);
            return sum + hours * rate;
        }, 0);

        const netProfit = totalRevenue - totalExpenses;

        // Monthly data for the last 12 months
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        const invoices = await prisma.invoice.findMany({
            where: {
                organizationId: orgId,
                status: 'PAID',
                paidAt: { gte: twelveMonthsAgo },
            },
            select: { paidAt: true, total: true },
        });

        const allTimeEntries = await prisma.timeEntry.findMany({
            where: {
                organizationId: orgId,
                billable: true,
                hourlyRate: { not: null },
                startTime: { gte: twelveMonthsAgo },
            },
            select: { startTime: true, durationMinutes: true, hourlyRate: true },
        });

        const monthlyMap = new Map<string, { revenue: number; expenses: number }>();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap.set(key, { revenue: 0, expenses: 0 });
        }

        for (const inv of invoices) {
            if (!inv.paidAt) continue;
            const d = new Date(inv.paidAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const entry = monthlyMap.get(key);
            if (entry) entry.revenue += Number(inv.total ?? 0);
        }

        for (const te of allTimeEntries) {
            if (!te.startTime) continue;
            const d = new Date(te.startTime);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const entry = monthlyMap.get(key);
            if (entry) {
                const hours = (te.durationMinutes ?? 0) / 60;
                entry.expenses += hours * Number(te.hourlyRate ?? 0);
            }
        }

        const monthlyData = Array.from(monthlyMap.entries()).map(([month, vals]) => ({
            month,
            revenue: Math.round(vals.revenue * 100) / 100,
            expenses: Math.round(vals.expenses * 100) / 100,
        }));

        // Recent invoices
        const recentInvoices = await prisma.invoice.findMany({
            where: { organizationId: orgId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
                contact: { select: { id: true, name: true } },
                project: { select: { id: true, name: true } },
            },
        });

        return {
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            netProfit: Math.round(netProfit * 100) / 100,
            monthlyData,
            recentInvoices,
        };
    },

    getAging: async (orgId: string) => {
        const now = new Date();
        const unpaidInvoices = await prisma.invoice.findMany({
            where: {
                organizationId: orgId,
                status: { notIn: ['PAID', 'CANCELLED'] },
                dueDate: { not: null },
            },
            include: {
                contact: { select: { id: true, name: true } },
            },
        });

        const buckets = {
            current: [] as typeof unpaidInvoices,
            thirtyDays: [] as typeof unpaidInvoices,
            sixtyDays: [] as typeof unpaidInvoices,
            ninetyPlus: [] as typeof unpaidInvoices,
        };

        for (const inv of unpaidInvoices) {
            if (!inv.dueDate) continue;
            const diffDays = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
            if (diffDays <= 0) {
                buckets.current.push(inv);
            } else if (diffDays <= 30) {
                buckets.thirtyDays.push(inv);
            } else if (diffDays <= 60) {
                buckets.sixtyDays.push(inv);
            } else {
                buckets.ninetyPlus.push(inv);
            }
        }

        const sumTotal = (items: typeof unpaidInvoices) =>
            Math.round(items.reduce((s, i) => s + Number(i.total ?? 0), 0) * 100) / 100;

        return {
            current: { total: sumTotal(buckets.current), count: buckets.current.length, invoices: buckets.current },
            thirtyDays: { total: sumTotal(buckets.thirtyDays), count: buckets.thirtyDays.length, invoices: buckets.thirtyDays },
            sixtyDays: { total: sumTotal(buckets.sixtyDays), count: buckets.sixtyDays.length, invoices: buckets.sixtyDays },
            ninetyPlus: { total: sumTotal(buckets.ninetyPlus), count: buckets.ninetyPlus.length, invoices: buckets.ninetyPlus },
        };
    },

    getProfitByProject: async (orgId: string) => {
        const projects = await prisma.project.findMany({
            where: { organizationId: orgId },
            select: { id: true, name: true, revenue: true },
        });

        const result = [];

        for (const project of projects) {
            // Revenue from paid invoices for this project
            const invoiceRevenue = await prisma.invoice.aggregate({
                where: { organizationId: orgId, projectId: project.id, status: 'PAID' },
                _sum: { total: true },
            });
            const revenue = Number(invoiceRevenue._sum.total ?? 0) || Number(project.revenue ?? 0);

            // Hours from time entries
            const timeAgg = await prisma.timeEntry.aggregate({
                where: { organizationId: orgId, projectId: project.id },
                _sum: { durationMinutes: true },
            });
            const hours = Math.round(((timeAgg._sum.durationMinutes ?? 0) / 60) * 100) / 100;

            // Cost from billable time entries
            const billableEntries = await prisma.timeEntry.findMany({
                where: { organizationId: orgId, projectId: project.id, billable: true, hourlyRate: { not: null } },
                select: { durationMinutes: true, hourlyRate: true },
            });
            const cost = billableEntries.reduce((sum, te) => {
                return sum + ((te.durationMinutes ?? 0) / 60) * Number(te.hourlyRate ?? 0);
            }, 0);

            const profit = revenue - cost;

            result.push({
                projectName: project.name,
                revenue: Math.round(revenue * 100) / 100,
                hours,
                profit: Math.round(profit * 100) / 100,
            });
        }

        return result;
    },
};
