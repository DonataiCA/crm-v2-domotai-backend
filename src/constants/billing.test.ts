import { describe, it, expect } from 'vitest';
import {
    PAYMENT_GRACE_DAYS,
    COLLECTION_STATUSES,
    BILLING_INTERVALS,
    deriveCollectionStatus,
    isCollectible,
    addInterval,
    nextPeriodStart,
} from './billing';

/**
 * El estado de cobranza no se guarda en ninguna columna: se deriva de la factura y del
 * día en que se mira. Por eso `today` es un parámetro y no `new Date()` — si no, estos
 * tests dependerían de cuándo se ejecutan y las fronteras serían imposibles de fijar.
 *
 * Las fronteras son lo único que importa aquí: el día del vencimiento, el último día de
 * gracia y el primero de morosidad.
 */

const HOY = new Date('2026-08-24T12:00:00.000Z');

/** Una factura enviada que vence `dias` después de hoy (negativo = ya venció). */
const factura = (dias: number, overrides: Record<string, unknown> = {}) => ({
    status: 'SENT',
    dueDate: new Date(Date.UTC(2026, 7, 24 + dias)),
    paidAt: null,
    ...overrides,
});

describe('PAYMENT_GRACE_DAYS', () => {
    it('son cinco días', () => {
        expect(PAYMENT_GRACE_DAYS).toBe(5);
    });
});

describe('deriveCollectionStatus — pagadas', () => {
    it('una factura con estado PAID está pagada, aunque venciera hace meses', () => {
        expect(deriveCollectionStatus(factura(-120, { status: 'PAID' }), HOY)).toBe('PAID');
    });

    it('una factura con fecha de pago está pagada aunque su estado no se haya actualizado', () => {
        const conPago = factura(-30, { status: 'SENT', paidAt: new Date('2026-08-01') });

        expect(deriveCollectionStatus(conPago, HOY)).toBe('PAID');
    });
});

describe('deriveCollectionStatus — las fronteras de la morosidad', () => {
    it('el día del vencimiento todavía no es moroso', () => {
        expect(deriveCollectionStatus(factura(0), HOY)).toBe('DUE');
    });

    it('el último día de gracia sigue sin ser moroso', () => {
        expect(deriveCollectionStatus(factura(-PAYMENT_GRACE_DAYS), HOY)).toBe('DUE');
    });

    it('un día después de la gracia ya es moroso', () => {
        expect(deriveCollectionStatus(factura(-PAYMENT_GRACE_DAYS - 1), HOY)).toBe('OVERDUE');
    });

    it('una factura que aún no vence está por vencer', () => {
        expect(deriveCollectionStatus(factura(10), HOY)).toBe('DUE');
    });

    /** El estado OVERDUE de la factura no manda: manda la fecha. */
    it('una factura marcada OVERDUE pero dentro de la gracia todavía no es morosa', () => {
        expect(deriveCollectionStatus(factura(-1, { status: 'OVERDUE' }), HOY)).toBe('DUE');
    });
});

describe('deriveCollectionStatus — sin fecha de vencimiento', () => {
    /** Sin vencimiento no hay plazo que incumplir; no puede ser morosa. */
    it('una factura sin vencimiento está por cobrar, nunca morosa', () => {
        expect(deriveCollectionStatus(factura(0, { dueDate: null }), HOY)).toBe('DUE');
    });
});

describe('isCollectible — qué es un cobro y qué no', () => {
    it('un borrador no es exigible: todavía no se ha enviado', () => {
        expect(isCollectible('DRAFT')).toBe(false);
    });

    it('una cancelada no es exigible: ya no se va a cobrar', () => {
        expect(isCollectible('CANCELLED')).toBe(false);
    });

    it.each(['SENT', 'PAID', 'OVERDUE'])('%s sí entra en cobranzas', (status) => {
        expect(isCollectible(status)).toBe(true);
    });
});

describe('COLLECTION_STATUSES', () => {
    it('son los que la página puede pedir', () => {
        expect([...COLLECTION_STATUSES]).toEqual(['PAID', 'DUE', 'OVERDUE', 'UNPAID']);
    });

    /**
     * UNPAID no es un estado que tenga una fila: es la unión de DUE y OVERDUE, y existe
     * para poder pedir "todo lo pendiente de cobro" de una vez. Ninguna fila se deriva
     * como UNPAID.
     */
    it('UNPAID es un filtro, no un estado que se derive', () => {
        const derivados = [
            deriveCollectionStatus({ status: 'PAID', dueDate: null, paidAt: null }, HOY),
            deriveCollectionStatus({ status: 'SENT', dueDate: null, paidAt: null }, HOY),
            deriveCollectionStatus({ status: 'SENT', dueDate: new Date('2020-01-01'), paidAt: null }, HOY),
        ];

        expect(derivados).not.toContain('UNPAID');
    });
});

describe('BILLING_INTERVALS', () => {
    it('son las cuatro periodicidades que ofrece el alta', () => {
        expect([...BILLING_INTERVALS]).toEqual(['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL']);
    });
});

describe('addInterval', () => {
    it('mensual avanza un mes', () => {
        expect(addInterval(new Date('2026-03-15T00:00:00Z'), 'MONTHLY'))
            .toEqual(new Date('2026-04-15T00:00:00Z'));
    });

    it('el 31 cae al último día del mes que no lo tiene', () => {
        expect(addInterval(new Date('2026-01-31T00:00:00Z'), 'MONTHLY'))
            .toEqual(new Date('2026-02-28T00:00:00Z'));
    });

    /**
     * Sin anclar al día original, la fecha de cobro se desplazaría hacia atrás para
     * siempre: quien contrata un 31 acabaría cobrando el 28 el resto de su vida.
     */
    it('y vuelve al 31 en el mes siguiente, en vez de quedarse en el 28', () => {
        const feb = addInterval(new Date('2026-01-31T00:00:00Z'), 'MONTHLY');

        expect(addInterval(feb, 'MONTHLY', 31)).toEqual(new Date('2026-03-31T00:00:00Z'));
    });

    it('respeta el 29 de febrero de un bisiesto', () => {
        expect(addInterval(new Date('2028-01-31T00:00:00Z'), 'MONTHLY'))
            .toEqual(new Date('2028-02-29T00:00:00Z'));
    });

    it('trimestral cruza el fin de año', () => {
        expect(addInterval(new Date('2026-11-10T00:00:00Z'), 'QUARTERLY'))
            .toEqual(new Date('2027-02-10T00:00:00Z'));
    });

    it.each([
        ['BIANNUAL', 6],
        ['ANNUAL', 12],
    ])('%s avanza %i meses', (interval, months) => {
        expect(addInterval(new Date('2026-01-10T00:00:00Z'), interval as never))
            .toEqual(new Date(Date.UTC(2026, months as number, 10)));
    });
});

describe('nextPeriodStart', () => {
    const sub = (over: Record<string, unknown> = {}) => ({
        interval: 'MONTHLY' as const,
        startDate: new Date('2026-08-01T00:00:00Z'),
        coveredUntil: null,
        cancelledAt: null,
        ...over,
    });

    it('recién dado de alta, toca su fecha de inicio', () => {
        expect(nextPeriodStart(sub(), new Date('2026-08-24T00:00:00Z')))
            .toEqual(new Date('2026-08-01T00:00:00Z'));
    });

    it('con el periodo cubierto, no toca nada todavía', () => {
        expect(nextPeriodStart(
            sub({ coveredUntil: new Date('2026-09-01T00:00:00Z') }),
            new Date('2026-08-24T00:00:00Z'),
        )).toBeNull();
    });

    it('un servicio cancelado no genera más cobros', () => {
        expect(nextPeriodStart(
            sub({ cancelledAt: new Date('2026-08-10T00:00:00Z') }),
            new Date('2026-08-24T00:00:00Z'),
        )).toBeNull();
    });

    /** Emitir tres de golpe le llegaría al cliente como tres reclamaciones el mismo día. */
    it('con tres periodos sin emitir devuelve uno, no tres', () => {
        expect(nextPeriodStart(
            sub({ coveredUntil: new Date('2026-05-01T00:00:00Z') }),
            new Date('2026-08-24T00:00:00Z'),
        )).toEqual(new Date('2026-05-01T00:00:00Z'));
    });

    it('un servicio que empieza en el futuro todavía no genera nada', () => {
        expect(nextPeriodStart(
            sub({ startDate: new Date('2026-12-01T00:00:00Z') }),
            new Date('2026-08-24T00:00:00Z'),
        )).toBeNull();
    });
});
