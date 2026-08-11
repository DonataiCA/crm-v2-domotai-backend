/**
 * IDs deterministas para el seed de QA.
 *
 * Los campos `id` son TEXT en la base, pero 22 validadores Zod exigen formato
 * UUID (`z.string().uuid()`), así que no se pueden usar etiquetas legibles:
 * un alta por API que referencie una entidad sembrada sería rechazada con 400.
 *
 * Solución: UUID v5 derivado de un namespace fijo. La misma etiqueta produce
 * siempre el mismo UUID, así que el seed es idempotente y `--reset` puede
 * borrar exactamente lo que sembró sin tocar datos reales.
 */
import { createHash } from 'crypto';

/** Namespace propio del seed de QA. Cambiarlo invalida todos los IDs. */
const QA_NAMESPACE = '9f1d4c2e-7b3a-4e6f-8c1d-2a5b7e9f0c3d';

const registry = new Map<string, string>();

function hexToBytes(hex: string): Buffer {
    return Buffer.from(hex.replace(/-/g, ''), 'hex');
}

/**
 * UUID v5 (SHA-1, RFC 4122). Implementado a mano para no depender del paquete
 * `uuid`, que aquí solo existe como dependencia transitiva de bull.
 */
function uuidV5(name: string, namespace: string): string {
    const hash = createHash('sha1')
        .update(hexToBytes(namespace))
        .update(Buffer.from(name, 'utf8'))
        .digest();

    const bytes = Buffer.from(hash.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

    const hex = bytes.toString('hex');
    return [
        hex.substring(0, 8),
        hex.substring(8, 12),
        hex.substring(12, 16),
        hex.substring(16, 20),
        hex.substring(20, 32),
    ].join('-');
}

/**
 * Devuelve el UUID estable asociado a una etiqueta legible.
 * Ej: qaId('lead:propuesta-01') → siempre el mismo UUID.
 */
export function qaId(label: string): string {
    const existing = registry.get(label);
    if (existing) return existing;
    const id = uuidV5(label, QA_NAMESPACE);
    registry.set(label, id);
    return id;
}

/** Todas las etiquetas resueltas hasta ahora, para imprimir la leyenda. */
export function legend(): Array<{ label: string; id: string }> {
    return Array.from(registry.entries())
        .map(([label, id]) => ({ label, id }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Marca todos los IDs generables por el seed. Se usa en `--reset` para
 * borrar solo lo sembrado por QA: se recomputan las etiquetas conocidas y se
 * borra por `id IN (...)`, nunca con un DELETE sin filtro.
 */
export function isQaId(id: string | null | undefined): boolean {
    if (!id) return false;
    return Array.from(registry.values()).includes(id);
}

// ── Helpers de fecha, relativos a la ejecución ──────────────────────────────
// El seed se re-ejecuta con el tiempo; los casos límite (vencido, caducado)
// deben seguir siéndolo, así que se calculan siempre relativos a hoy.

export const now = () => new Date();

export function daysFromNow(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(12, 0, 0, 0);
    return d;
}

export function daysAgo(n: number): Date {
    return daysFromNow(-n);
}
