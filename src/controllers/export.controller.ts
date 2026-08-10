import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { prisma } from '../config/prisma';

function toCSV(headers: string[], rows: Record<string, any>[]): string {
    const headerLine = headers.join(',');
    const dataLines = rows.map(row =>
        headers.map(h => {
            const val = row[h] ?? '';
            const str = String(val).replace(/"/g, '""');
            return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
        }).join(',')
    );
    return [headerLine, ...dataLines].join('\n');
}

export const ExportController = {
    projects: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const projects = await prisma.project.findMany({
                where: { organizationId },
                include: {
                    projectLead: { select: { fullName: true } },
                },
                orderBy: { createdAt: 'desc' },
            });

            const rows = projects.map(p => ({
                name: p.name,
                status: p.status ?? '',
                price: p.price != null ? Number(p.price) : '',
                revenue: p.revenue != null ? Number(p.revenue) : '',
                startDate: p.startDate ? p.startDate.toISOString() : '',
                endDate: p.endDate ? p.endDate.toISOString() : '',
                projectLead: p.projectLead?.fullName ?? '',
            }));

            const csvString = toCSV(['name', 'status', 'price', 'revenue', 'startDate', 'endDate', 'projectLead'], rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="projects.csv"');
            res.send(csvString);
        } catch (error) {
            return sendError(res, 500, 'Failed to export projects', error);
        }
    },

    leads: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const leads = await prisma.lead.findMany({
                where: { organizationId },
                include: {
                    contact: { select: { name: true } },
                    assignee: { select: { fullName: true } },
                },
                orderBy: { createdAt: 'desc' },
            });

            const rows = leads.map(l => ({
                name: l.name ?? '',
                stage: l.stage ?? '',
                price: l.price != null ? Number(l.price) : '',
                contact: l.contact?.name ?? '',
                assignee: l.assignee?.fullName ?? '',
            }));

            const csvString = toCSV(['name', 'stage', 'price', 'contact', 'assignee'], rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
            res.send(csvString);
        } catch (error) {
            return sendError(res, 500, 'Failed to export leads', error);
        }
    },

    contacts: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const contacts = await prisma.contact.findMany({
                where: { organizationId, deletedAt: null },
                orderBy: { createdAt: 'desc' },
            });

            const rows = contacts.map(c => ({
                name: c.name,
                email: c.email ?? '',
                phone: c.phone ?? '',
                company: c.company ?? '',
                category: c.category ?? '',
                city: c.city ?? '',
                country: c.country ?? '',
            }));

            const csvString = toCSV(['name', 'email', 'phone', 'company', 'category', 'city', 'country'], rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
            res.send(csvString);
        } catch (error) {
            return sendError(res, 500, 'Failed to export contacts', error);
        }
    },

    invoices: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const invoices = await prisma.invoice.findMany({
                where: { organizationId },
                include: {
                    contact: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
            });

            const rows = invoices.map(i => ({
                invoiceNumber: i.invoiceNumber ?? '',
                status: i.status,
                total: i.total != null ? Number(i.total) : '',
                contactName: i.contact?.name ?? '',
                issueDate: i.issueDate ? i.issueDate.toISOString() : '',
                dueDate: i.dueDate ? i.dueDate.toISOString() : '',
            }));

            const csvString = toCSV(['invoiceNumber', 'status', 'total', 'contactName', 'issueDate', 'dueDate'], rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
            res.send(csvString);
        } catch (error) {
            return sendError(res, 500, 'Failed to export invoices', error);
        }
    },

    timeEntries: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const entries = await prisma.timeEntry.findMany({
                where: { organizationId },
                include: {
                    profile: { select: { fullName: true } },
                    project: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
            });

            const rows = entries.map(e => ({
                user: e.profile?.fullName ?? '',
                project: e.project?.name ?? '',
                description: e.description ?? '',
                startTime: e.startTime ? e.startTime.toISOString() : '',
                endTime: e.endTime ? e.endTime.toISOString() : '',
                durationMinutes: e.durationMinutes ?? '',
                billable: e.billable ? 'Yes' : 'No',
            }));

            const csvString = toCSV(['user', 'project', 'description', 'startTime', 'endTime', 'durationMinutes', 'billable'], rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="time-entries.csv"');
            res.send(csvString);
        } catch (error) {
            return sendError(res, 500, 'Failed to export time entries', error);
        }
    },
};
