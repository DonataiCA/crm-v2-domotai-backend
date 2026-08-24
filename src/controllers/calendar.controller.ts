import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { CalendarRepository } from '../repositories/calendar.repository';

type MilestoneRow = {
    id: string;
    name: string;
    status: string | null;
    startDate: Date | null;
    endDate: Date | null;
    projectId?: string;
    project?: { id: string; name: string } | null;
};

export type CalendarMilestone = {
    kind: 'project-start' | 'project-end' | 'phase-start' | 'phase-end';
    refId: string;
    projectId: string;
    title: string;
    projectName: string;
    status: string | null;
    date: Date;
};

/**
 * Desdobla cada registro en hasta dos hitos (inicio y fin). Se hace aquí y no en
 * el frontend para que las tres vistas del calendario consuman una sola forma.
 * La query trae registros cuyo inicio *o* fin cae en el rango, así que hay que
 * descartar el extremo que se queda fuera.
 */
function flattenMilestones(
    rows: MilestoneRow[],
    entity: 'project' | 'phase',
    from: Date,
    to: Date,
): CalendarMilestone[] {
    const out: CalendarMilestone[] = [];

    for (const row of rows) {
        const projectId = entity === 'phase' ? row.project?.id ?? row.projectId ?? '' : row.id;
        const projectName = entity === 'phase' ? row.project?.name ?? '' : row.name;

        const push = (kind: CalendarMilestone['kind'], date: Date | null) => {
            if (!date || date < from || date > to) return;
            out.push({ kind, refId: row.id, projectId, title: row.name, projectName, status: row.status, date });
        };

        push(`${entity}-start` as CalendarMilestone['kind'], row.startDate);
        push(`${entity}-end` as CalendarMilestone['kind'], row.endDate);
    }

    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export const CalendarController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const filters = {
                dateFrom: req.query.dateFrom as string | undefined,
                dateTo: req.query.dateTo as string | undefined,
                contactId: req.query.contactId as string | undefined,
                leadId: req.query.leadId as string | undefined,
                projectId: req.query.projectId as string | undefined,
            };

            const events = await CalendarRepository.findAll(orgId, filters);
            res.json(events);
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch calendar events', error);
        }
    },

    /**
     * Vista agregada del calendario: eventos propios más los hitos derivados de
     * proyectos y fases. Los hitos son de sólo lectura — se calculan en cada
     * consulta y no se materializan en `calendar_events`, así que cambiar la
     * fecha de un proyecto se refleja aquí sin sincronizar nada.
     */
    overview: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const { dateFrom, dateTo, sources } = req.query as {
                dateFrom: string;
                dateTo: string;
                sources?: string;
            };

            const wanted = sources ? new Set(sources.split(',').map(s => s.trim())) : null;
            const wants = (source: string) => !wanted || wanted.has(source);

            const from = new Date(dateFrom);
            // `dateTo` llega como 'YYYY-MM-DD' (último día del mes) y `new Date`
            // lo interpreta a medianoche, lo que dejaría fuera todo lo que ocurre
            // ese mismo día a partir de las 00:00.
            const to = new Date(dateTo);
            if (dateTo.length <= 10) to.setUTCHours(23, 59, 59, 999);

            const [events, projects, phases] = await Promise.all([
                wants('events')
                    ? CalendarRepository.findAll(orgId, { dateFrom, dateTo: to.toISOString() })
                    : Promise.resolve([]),
                wants('projects')
                    ? CalendarRepository.findProjectMilestones(orgId, from, to)
                    : Promise.resolve([]),
                wants('phases')
                    ? CalendarRepository.findPhaseMilestones(orgId, from, to)
                    : Promise.resolve([]),
            ]);

            res.json({
                events,
                projects: flattenMilestones(projects, 'project', from, to),
                phases: flattenMilestones(phases, 'phase', from, to),
            });
        } catch (error) {
            return sendError(res, 500, 'Failed to fetch calendar overview', error);
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;

            const userId = (req as any).userId;
            const { title, description, startDate, endDate, allDay, color, contactId, leadId, projectId } = req.body;

            if (!title || !startDate) {
                return sendError(res, 400, 'title and startDate are required');
            }

            const event = await CalendarRepository.create({
                organizationId: orgId,
                title,
                description,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : undefined,
                allDay: allDay ?? false,
                color,
                contactId,
                leadId,
                projectId,
                createdBy: userId,
            });

            res.status(201).json(event);
        } catch (error) {
            return sendError(res, 500, 'Failed to create calendar event', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await CalendarRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Calendar event not found');

            const data: Record<string, unknown> = { ...req.body };
            if (data.startDate) data.startDate = new Date(data.startDate as string);
            if (data.endDate) data.endDate = new Date(data.endDate as string);

            const event = await CalendarRepository.update(req.params.id, data, orgId);
            res.json(event);
        } catch (error) {
            return sendError(res, 500, 'Failed to update calendar event', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const existing = await CalendarRepository.findById(req.params.id, orgId);
            if (!existing) return sendError(res, 404, 'Calendar event not found');

            await CalendarRepository.delete(req.params.id, orgId);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to delete calendar event', error);
        }
    },
};
