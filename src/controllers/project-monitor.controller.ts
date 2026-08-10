import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { prisma } from '../config/prisma';
import { randomUUID } from 'crypto';

export const ProjectMonitorController = {
    // ─── INGEST (PUBLIC — authenticated by API key) ─────────────────────────

    /**
     * POST /monitor/:apiKey/ingest
     * Receives heartbeats, errors, and deploys from the SDK.
     */
    ingest: async (req: Request, res: Response) => {
        try {
            const { apiKey } = req.params;
            if (!apiKey) return sendError(res, 400, 'API key is required');

            const project = await prisma.project.findFirst({
                where: { monitorApiKey: apiKey },
                select: { id: true },
            });

            if (!project) return sendError(res, 401, 'Invalid API key');

            const { type, payload } = req.body;
            if (!type || !payload) {
                return sendError(res, 400, 'type and payload are required');
            }

            const validTypes = ['heartbeat', 'error', 'deploy'];
            if (!validTypes.includes(type)) {
                return sendError(res, 400, `Invalid type. Must be one of: ${validTypes.join(', ')}`);
            }

            await prisma.monitorEvent.create({
                data: {
                    projectId: project.id,
                    type,
                    payload,
                },
            });

            // If it's a heartbeat with productionUrl, run a health check
            if (type === 'heartbeat' && payload.productionUrl) {
                try {
                    const start = Date.now();
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 10000);

                    const response = await fetch(payload.productionUrl, {
                        method: 'HEAD',
                        signal: controller.signal,
                    });
                    clearTimeout(timeout);

                    const responseTimeMs = Date.now() - start;

                    await prisma.healthCheck.create({
                        data: {
                            projectId: project.id,
                            statusCode: response.status,
                            responseTimeMs,
                            isUp: response.status >= 200 && response.status < 500,
                        },
                    });
                } catch (healthErr: any) {
                    await prisma.healthCheck.create({
                        data: {
                            projectId: project.id,
                            statusCode: null,
                            responseTimeMs: null,
                            isUp: false,
                            errorMessage: healthErr.message || 'Connection failed',
                        },
                    });
                }
            }

            res.status(201).json({ received: true });
        } catch (error) {
            return sendError(res, 500, 'Failed to ingest event', error);
        }
    },

    // ─── OVERVIEW (AUTHENTICATED) ───────────────────────────────────────────

    overview: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const projects = await prisma.project.findMany({
                where: { organizationId },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    productionUrl: true,
                    monitorApiKey: true,
                    updatedAt: true,
                },
                orderBy: { updatedAt: 'desc' },
            });

            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const data = await Promise.all(projects.map(async (p) => {
                const hasMonitoring = !!p.monitorApiKey;

                // Get last heartbeat
                const lastHeartbeat = hasMonitoring ? await prisma.monitorEvent.findFirst({
                    where: { projectId: p.id, type: 'heartbeat' },
                    orderBy: { receivedAt: 'desc' },
                    select: { receivedAt: true },
                }) : null;

                // Get error count in last 24h
                const errorCount24h = hasMonitoring ? await prisma.monitorEvent.count({
                    where: { projectId: p.id, type: 'error', receivedAt: { gte: oneDayAgo } },
                }) : 0;

                // Get last health check
                const lastCheck = hasMonitoring ? await prisma.healthCheck.findFirst({
                    where: { projectId: p.id },
                    orderBy: { checkedAt: 'desc' },
                }) : null;

                return {
                    projectId: p.id,
                    projectName: p.name,
                    hasMonitoring,
                    productionUrl: p.productionUrl,
                    isUp: lastCheck?.isUp ?? null,
                    lastHeartbeatAt: lastHeartbeat?.receivedAt?.toISOString() ?? null,
                    errorCount24h,
                };
            }));

            res.json({ data });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch monitor overview', error);
        }
    },

    // ─── STATUS (AUTHENTICATED) ─────────────────────────────────────────────

    status: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const { projectId } = req.params;

            const project = await prisma.project.findFirst({
                where: { id: projectId, organizationId },
                select: { id: true, productionUrl: true, monitorApiKey: true },
            });

            if (!project) return sendError(res, 404, 'Project not found');

            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            // Uptime: % of health checks that were "up" in last 24h
            const [totalChecks, upChecks] = await Promise.all([
                prisma.healthCheck.count({ where: { projectId, checkedAt: { gte: oneDayAgo } } }),
                prisma.healthCheck.count({ where: { projectId, checkedAt: { gte: oneDayAgo }, isUp: true } }),
            ]);
            const uptimePercent = totalChecks > 0 ? Math.round((upChecks / totalChecks) * 10000) / 100 : null;

            // Average response time (last 24h)
            const avgResult = await prisma.healthCheck.aggregate({
                where: { projectId, checkedAt: { gte: oneDayAgo }, responseTimeMs: { not: null } },
                _avg: { responseTimeMs: true },
            });
            const avgResponseTimeMs = avgResult._avg.responseTimeMs ? Math.round(avgResult._avg.responseTimeMs) : null;

            // Error count 24h
            const errorCount24h = await prisma.monitorEvent.count({
                where: { projectId, type: 'error', receivedAt: { gte: oneDayAgo } },
            });

            // Last health check → isUp
            const lastCheck = await prisma.healthCheck.findFirst({
                where: { projectId },
                orderBy: { checkedAt: 'desc' },
            });

            // Last heartbeat
            const lastHeartbeat = await prisma.monitorEvent.findFirst({
                where: { projectId, type: 'heartbeat' },
                orderBy: { receivedAt: 'desc' },
            });

            // Last deploy
            const lastDeploy = await prisma.monitorEvent.findFirst({
                where: { projectId, type: 'deploy' },
                orderBy: { receivedAt: 'desc' },
            });

            res.json({
                isUp: lastCheck?.isUp ?? null,
                uptimePercent,
                avgResponseTimeMs,
                errorCount24h,
                lastHeartbeat: lastHeartbeat ? {
                    receivedAt: lastHeartbeat.receivedAt.toISOString(),
                    payload: lastHeartbeat.payload,
                } : null,
                lastDeploy: lastDeploy ? {
                    receivedAt: lastDeploy.receivedAt.toISOString(),
                    payload: lastDeploy.payload,
                } : null,
                hasMonitoring: !!project.monitorApiKey,
                productionUrl: project.productionUrl,
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch project status', error);
        }
    },

    // ─── EVENTS (AUTHENTICATED) ─────────────────────────────────────────────

    events: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const { projectId } = req.params;

            const project = await prisma.project.findFirst({
                where: { id: projectId, organizationId },
                select: { id: true },
            });

            if (!project) return sendError(res, 404, 'Project not found');

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const typeFilter = req.query.type as string;
            const where: any = { projectId };
            if (typeFilter) {
                where.type = typeFilter.toLowerCase(); // SDK stores lowercase, frontend may send uppercase
            }

            const [data, total] = await Promise.all([
                prisma.monitorEvent.findMany({
                    where,
                    orderBy: { receivedAt: 'desc' },
                    skip,
                    take: limit,
                }),
                prisma.monitorEvent.count({ where }),
            ]);

            res.json({
                data: data.map(e => ({
                    id: e.id,
                    type: e.type,
                    payload: e.payload,
                    receivedAt: e.receivedAt.toISOString(),
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch monitor events', error);
        }
    },

    // ─── HEALTH CHECKS (AUTHENTICATED) ──────────────────────────────────────

    healthChecks: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const { projectId } = req.params;

            const project = await prisma.project.findFirst({
                where: { id: projectId, organizationId },
                select: { id: true },
            });

            if (!project) return sendError(res, 404, 'Project not found');

            const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 288));

            const data = await prisma.healthCheck.findMany({
                where: { projectId },
                orderBy: { checkedAt: 'desc' },
                take: limit,
            });

            res.json({
                data: data.map(h => ({
                    id: h.id,
                    statusCode: h.statusCode,
                    responseTimeMs: h.responseTimeMs,
                    isUp: h.isUp,
                    checkedAt: h.checkedAt.toISOString(),
                    errorMessage: h.errorMessage,
                })),
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch health checks', error);
        }
    },

    // ─── METRICS / HEARTBEATS (AUTHENTICATED) ───────────────────────────────

    metrics: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const { projectId } = req.params;

            const project = await prisma.project.findFirst({
                where: { id: projectId, organizationId },
                select: { id: true },
            });

            if (!project) return sendError(res, 404, 'Project not found');

            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const heartbeats = await prisma.monitorEvent.findMany({
                where: { projectId, type: 'heartbeat', receivedAt: { gte: oneDayAgo } },
                orderBy: { receivedAt: 'asc' },
                take: 288, // ~5 min intervals for 24h
            });

            res.json({
                heartbeats: heartbeats.map(h => ({
                    id: h.id,
                    type: h.type,
                    payload: h.payload,
                    receivedAt: h.receivedAt.toISOString(),
                })),
                metrics: heartbeats.map(h => ({
                    id: h.id,
                    type: h.type,
                    payload: h.payload,
                    receivedAt: h.receivedAt.toISOString(),
                })),
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch metrics', error);
        }
    },

    // ─── GENERATE API KEY (AUTHENTICATED) ───────────────────────────────────

    generateKey: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const { projectId } = req.params;

            const project = await prisma.project.findFirst({
                where: { id: projectId, organizationId },
                select: { id: true },
            });

            if (!project) return sendError(res, 404, 'Project not found');

            const apiKey = randomUUID();

            await prisma.project.update({
                where: { id: projectId },
                data: { monitorApiKey: apiKey },
            });

            res.json({ apiKey });
        } catch (error) {
            return sendError(res, 500, 'Failed to generate API key', error);
        }
    },
};
