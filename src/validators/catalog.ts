import { z } from 'zod';

/**
 * Construye un schema de catálogo que es **tolerante al leer y estricto al
 * guardar**: acepta las grafías históricas que todavía puede mandar un cliente
 * desplegado antes que esta versión, pero sólo deja pasar el valor canónico.
 *
 * Hace falta porque los dos repos se despliegan por separado: entre el deploy
 * del backend y el del frontend hay una ventana en la que el cliente viejo sigue
 * enviando el estado en Title Case. Sin esta capa recibiría un 400 y la pantalla
 * se rompería; con ella se guarda el valor canónico y nadie se entera.
 *
 * Lo que no reconoce se deja intacto a propósito, para que sea `z.enum` quien
 * produzca el error con su mensaje —"expected one of..."— en vez de un `null`
 * que daría un mensaje de tipo, más confuso.
 */
export function tolerantEnum<T extends string>(
    values: readonly [T, ...T[]],
    normalize: (value: string | null | undefined) => T | null,
) {
    return z.preprocess(
        (value) => (typeof value === 'string' ? (normalize(value) ?? value) : value),
        z.enum(values),
    );
}
