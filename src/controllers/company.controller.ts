import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { CompanyRepository } from '../repositories/company.repository';
import { logAudit } from '../utils/audit';
import { prisma } from '../config/prisma';

export const CompanyController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const filters = {
                search: req.query.search as string | undefined,
            };

            const [data, total] = await Promise.all([
                CompanyRepository.findAll(orgId, skip, limit, filters),
                CompanyRepository.count(orgId, filters),
            ]);

            res.json({
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch companies', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const company = await CompanyRepository.findById(req.params.id, orgId);
            if (!company) return sendError(res, 404, 'Company not found');
            res.json(company);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch company', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const userId = (req as any).userId;
            const company = await CompanyRepository.create({
                ...req.body,
                organizationId: orgId,
                createdBy: userId,
            });

            res.status(201).json(company);
            await logAudit(req, { action: 'CREATE', entityType: 'Company', entityId: company.id, entityName: company.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to create company', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await CompanyRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Company not found');

            const company = await CompanyRepository.update(req.params.id, req.body, orgId);
            if (!company) return sendError(res, 404, 'Company not found');
            res.json(company);
            await logAudit(req, { action: 'UPDATE', entityType: 'Company', entityId: company.id, entityName: company.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to update company', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await CompanyRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Company not found');

            await CompanyRepository.softDelete(req.params.id, orgId);
            res.sendStatus(204);
            await logAudit(req, { action: 'DELETE', entityType: 'Company', entityId: existing.id, entityName: existing.name });
        } catch (error) {
            return sendError(res, 500, 'Failed to delete company', error);
        }
    },

    addFileLink: async (req: Request, res: Response) => {
        try {
            const { companyId } = req.params;
            const userId = (req as any).user?.profileId;
            const { title, url, fileType } = req.body;
            if (!title || !url) return sendError(res, 400, 'title and url are required');

            const fileLink = await prisma.fileLink.create({
                data: { companyId, title, url, fileType, createdBy: userId },
                include: { creator: { select: { id: true, fullName: true, email: true } } },
            });
            res.status(201).json(fileLink);
        } catch (error) {
            return sendError(res, 500, 'Failed to add file link', error);
        }
    },

    deleteFileLink: async (req: Request, res: Response) => {
        try {
            await prisma.fileLink.delete({ where: { id: req.params.fileId } });
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete file link', error);
        }
    },
};
