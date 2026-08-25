/**
 * Cálculo de los importes de una factura.
 *
 * Vive aquí y se usa desde el repositorio para que haya **una sola fuente de verdad**:
 * si el cliente pudiera mandar el total de una línea, se podría guardar una factura cuyo
 * total no es la suma de lo que la compone, y ese descuadre no se detecta hasta que
 * alguien lo reclama.
 *
 * Sin Prisma a propósito: los importes se prueban sin levantar Postgres.
 */

export interface RawItem {
    description: string;
    quantity: number | string;
    unitPrice: number | string;
}

export interface ComputedItem {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
}

export interface InvoiceTotals {
    items: ComputedItem[];
    subtotal: number;
    tax: number;
    total: number;
}

/**
 * Dos decimales. Es dinero, y en coma flotante `0.1 * 3` da 0.30000000000000004: sin
 * redondear, ese resto acaba en la columna `Decimal(12,2)` de la base y en el total que
 * ve el cliente.
 */
function round2(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
}

export function computeInvoiceTotals(items: RawItem[] = [], tax: number | string = 0): InvoiceTotals {
    const computed = items.map((item) => {
        // Un formulario manda los números como cadena; convertir aquí evita que una
        // concatenación silenciosa acabe en un importe absurdo.
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        return {
            description: item.description,
            quantity,
            unitPrice,
            total: round2(quantity * unitPrice),
        };
    });

    const subtotal = round2(computed.reduce((sum, item) => sum + item.total, 0));
    const taxAmount = round2(Number(tax) || 0);

    return { items: computed, subtotal, tax: taxAmount, total: round2(subtotal + taxAmount) };
}
