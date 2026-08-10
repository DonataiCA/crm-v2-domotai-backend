import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { FinancialRepository } from '../repositories/financial.repository';

export const FinancialController = {
    dashboard: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const data = await FinancialRepository.getDashboard(orgId);
            res.json(data);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch financial dashboard', error);
        }
    },

    aging: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const data = await FinancialRepository.getAging(orgId);
            res.json(data);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch aging report', error);
        }
    },

    profitByProject: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const data = await FinancialRepository.getProfitByProject(orgId);
            res.json(data);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch profit by project', error);
        }
    },
};
