import { describe, it, expect } from 'vitest';
import {
    PAYMENT_GRACE_DAYS,
    COLLECTION_STATUSES,
    deriveCollectionStatus,
    isCollectible,
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
    it('son los tres que la página muestra', () => {
        expect([...COLLECTION_STATUSES]).toEqual(['PAID', 'DUE', 'OVERDUE']);
    });
});
