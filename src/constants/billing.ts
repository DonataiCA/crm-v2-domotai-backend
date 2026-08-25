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

/**
 * Lo que la página puede pedir. Los tres primeros son estados que una fila tiene;
 * `UNPAID` **no lo es**: es la unión de `DUE` y `OVERDUE`, y existe para poder pedir de
 * una vez todo lo pendiente de cobro —lo que el panel resume como "Total outstanding"—
 * sin exportar dos veces y pegar los archivos.
 */
export const COLLECTION_STATUSES = ['PAID', 'DUE', 'OVERDUE', 'UNPAID'] as const;

export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

/** Lo que `deriveCollectionStatus` puede devolver: `UNPAID` nunca sale de una fila. */
export type DerivedCollectionStatus = Exclude<CollectionStatus, 'UNPAID'>;

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
): DerivedCollectionStatus {
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

// ─── Periodicidad de los servicios recurrentes ──────────────────────────────

/** Cada cuánto se cobra un servicio. */
export const BILLING_INTERVALS = ['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL'] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

const MONTHS_PER_INTERVAL: Record<BillingInterval, number> = {
    MONTHLY: 1,
    QUARTERLY: 3,
    BIANNUAL: 6,
    ANNUAL: 12,
};

/**
 * Avanza una fecha un periodo.
 *
 * `anchorDay` es el día en que se contrató, y existe por un motivo concreto: quien
 * empieza un 31 no tiene 31 en febrero. Si se guardara el 28 resultante y se siguiera
 * sumando desde ahí, la fecha de cobro **se desplazaría hacia atrás para siempre** y ese
 * cliente acabaría cobrándose el 28 el resto de su vida. Anclando al día original, febrero
 * cae al 28 pero marzo vuelve al 31.
 *
 * Todo en UTC: sumar meses en hora local mueve el día cuando cambia el horario de verano.
 */
export function addInterval(date: Date, interval: BillingInterval, anchorDay?: number): Date {
    const months = MONTHS_PER_INTERVAL[interval];
    const day = anchorDay ?? date.getUTCDate();

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + months;

    // El día 0 del mes siguiente es el último del mes destino.
    const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTarget)));
}

/** Lo mínimo que hace falta de un servicio para saber qué periodo toca emitir. */
export interface PeriodicSubscription {
    interval: BillingInterval;
    startDate: Date;
    /** Fin del último periodo ya emitido. */
    coveredUntil: Date | null;
    cancelledAt: Date | null;
}

/**
 * Inicio del periodo que falta por emitir, o `null` si no toca nada.
 *
 * Devuelve **uno**, nunca varios: un servicio con tres periodos sin emitir le llegaría al
 * cliente como tres reclamaciones el mismo día. Quien llame vuelve a preguntar después de
 * emitir, y así avanza de uno en uno.
 */
export function nextPeriodStart(subscription: PeriodicSubscription, today: Date): Date | null {
    if (subscription.cancelledAt) return null;

    const next = subscription.coveredUntil ?? subscription.startDate;
    return next <= today ? next : null;
}
