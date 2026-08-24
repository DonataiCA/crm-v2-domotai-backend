import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { CollectionRepository, type CollectionFilters } from '../repositories/collection.repository';
import {
    COLLECTION_STATUSES,
    deriveCollectionStatus,
    type CollectionStatus,
} from '../constants/billing';

/**
 * Cobranzas: la misma tabla de facturas leída para perseguir el cobro.
 *
 * Dos endpoints y una regla: la lista se pagina **en la base**, y el resumen se cuenta
 * con agregados. En ningún caso se trae la tabla entera para recortarla aquí — es
 * justamente lo que hace la página de facturas y lo que esta evita.
 */

/** Tope de filas por página: sube el coste de la consulta y el peso de la respuesta. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;

function parseStatus(value: unknown): CollectionStatus | undefined {
    return (COLLECTION_STATUSES as readonly string[]).includes(String(value))
        ? (value as CollectionStatus)
        : undefined;
}

function parseDate(value: unknown): Date | undefined {
    if (typeof value !== 'string' || !value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Una fila con lo justo para pintarla, y con el estado que no existe como columna. */
function toRow(invoice: any, today: Date) {
    return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        // Lo que se le cobra: la primera línea describe el servicio. Si la factura no
        // tiene líneas, el proyecto es la mejor pista antes de dejarlo en blanco.
        service: invoice.items?.[0]?.description ?? invoice.project?.name ?? null,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        total: invoice.total,
        currency: invoice.currency,
        status: invoice.status,
        collectionStatus: deriveCollectionStatus(invoice, today),
        contact: invoice.contact,
        project: invoice.project,
    };
}

export const CollectionController = {
    index: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const today = new Date();

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(
                MAX_LIMIT,
                Math.max(1, parseInt(req.query.limit as string) || DEFAULT_LIMIT),
            );

            const filters: CollectionFilters = {
                status: parseStatus(req.query.status),
                search: (req.query.search as string) || undefined,
                dueFrom: parseDate(req.query.dueFrom),
                dueTo: parseDate(req.query.dueTo),
            };

            const [rows, total] = await Promise.all([
                CollectionRepository.findAll(orgId, (page - 1) * limit, limit, filters, today),
                CollectionRepository.count(orgId, filters, today),
            ]);

            res.json({
                data: rows.map((row) => toRow(row, today)),
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (error) {
            sendError(res, 500, 'Failed to fetch collections', error);
        }
    },

    summary: async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            res.json(await CollectionRepository.summary(orgId, new Date()));
        } catch (error) {
            sendError(res, 500, 'Failed to fetch collections summary', error);
        }
    },
};
