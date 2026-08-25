import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals } from './invoice-totals';

/**
 * Los importes son la parte del sistema donde un error se paga en dinero, así que se
 * calculan en un solo sitio y se prueban aparte. Que el cliente pueda mandar el total de
 * una línea permite guardar una factura que no cuadra consigo misma.
 */

describe('computeInvoiceTotals', () => {
    it('el total de una línea es cantidad por precio', () => {
        const { items } = computeInvoiceTotals([{ description: 'Plan', quantity: 3, unitPrice: 100 }], 0);

        expect(items[0].total).toBe(300);
    });

    it('el subtotal es la suma de las líneas', () => {
        const { subtotal } = computeInvoiceTotals(
            [
                { description: 'A', quantity: 2, unitPrice: 50 },
                { description: 'B', quantity: 1, unitPrice: 30 },
            ],
            0,
        );

        expect(subtotal).toBe(130);
    });

    it('el total suma el impuesto al subtotal', () => {
        expect(computeInvoiceTotals([{ description: 'A', quantity: 1, unitPrice: 100 }], 19).total)
            .toBe(119);
    });

    it('redondea a dos decimales en vez de arrastrar el error del binario', () => {
        // 0.1 * 3 da 0.30000000000000004 en coma flotante.
        const { subtotal } = computeInvoiceTotals([{ description: 'A', quantity: 3, unitPrice: 0.1 }], 0);

        expect(subtotal).toBe(0.3);
    });

    it('sin líneas el total es el impuesto, no NaN', () => {
        expect(computeInvoiceTotals([], 0)).toMatchObject({ subtotal: 0, total: 0 });
    });

    it('ignora el total que venga en la línea: manda cantidad por precio', () => {
        const { items } = computeInvoiceTotals(
            [{ description: 'A', quantity: 2, unitPrice: 10, total: 999 } as never],
            0,
        );

        expect(items[0].total).toBe(20);
    });

    it('acepta cantidades y precios que llegan como cadena, que es lo que manda un formulario', () => {
        const { total } = computeInvoiceTotals(
            [{ description: 'A', quantity: '2', unitPrice: '10.50' } as never],
            0,
        );

        expect(total).toBe(21);
    });
});
