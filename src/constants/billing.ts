/**
 * Reglas de cobranza.
 *
 * El estado de cobranza **no se guarda**: se deriva de la factura y del día en que se
 * mira. Guardarlo obligaría a un proceso que recorriera las facturas cada noche para
 * marcar morosos, y ese proceso siempre acaba desincronizado con la realidad.
 *
 * Vive aparte de Prisma para poder probar las fronteras —el día del vencimiento, el
 * último de gracia, el primero de morosidad— sin levantar Postgres.
 */

/**
 * Margen antes de considerar moroso a quien no ha pagado. Existe porque un día de
 * retraso no es morosidad: castigarlo genera llamadas de cobro que dañan la relación
 * con el cliente por un desfase de fechas de valor.
 */
export const PAYMENT_GRACE_DAYS = 5;

/** Los tres estados que la página de cobranzas distingue. */
export const COLLECTION_STATUSES = ['PAID', 'DUE', 'OVERDUE'] as const;

export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

/**
 * Estados de factura que representan un cobro real. Un borrador todavía no se ha
 * enviado y una cancelada ya no se va a cobrar: ninguno de los dos debe contar en el
 * resumen ni aparecer en la lista, o el "10/40" mentiría.
 */
const NOT_COLLECTIBLE = new Set(['DRAFT', 'CANCELLED']);

export function isCollectible(status: string | null | undefined): boolean {
    return !NOT_COLLECTIBLE.has(String(status ?? ''));
}

/** Lo mínimo que hace falta de una factura para situarla. */
export interface CollectibleInvoice {
    status: string | null;
    dueDate: Date | null;
    paidAt: Date | null;
}

/**
 * `today` es un parámetro y no `new Date()` dentro: así el resultado es reproducible y
 * los tests pueden fijar cada frontera en vez de depender de cuándo se ejecutan.
 */
export function deriveCollectionStatus(
    invoice: CollectibleInvoice,
    today: Date,
): CollectionStatus {
    if (invoice.status === 'PAID' || invoice.paidAt) return 'PAID';

    // Sin vencimiento no hay plazo que incumplir, así que no puede ser morosa.
    if (!invoice.dueDate) return 'DUE';

    return invoice.dueDate < overdueCutoff(today) ? 'OVERDUE' : 'DUE';
}

/**
 * Fecha a partir de la cual un vencimiento pasa a ser morosidad. Se expone porque el
 * repositorio la necesita para filtrar en SQL: el mismo corte tiene que valer para
 * derivar el estado de una fila y para contar cuántas hay, o la lista y el resumen
 * dirían cosas distintas.
 */
export function overdueCutoff(today: Date): Date {
    const cutoff = new Date(today);
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - PAYMENT_GRACE_DAYS);
    return cutoff;
}
