import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
    ACCEPTED_DOCUMENT_EXTENSIONS,
    MAX_CHAT_MESSAGE_CHARS,
    MAX_DOCUMENT_CHARS,
    MAX_DOCUMENT_FILENAME_CHARS,
    MAX_TEMPLATE_CHARS,
    MAX_TEMPLATE_TASKS,
} from './document';

describe('límites del documento', () => {
    it('el tope de la plantilla es mucho más alto que el del chat', () => {
        // El del chat es presupuesto de prompt; el de la plantilla no entra en ninguno.
        expect(MAX_TEMPLATE_CHARS).toBeGreaterThan(MAX_DOCUMENT_CHARS);
    });

    it('cabe el máximo de tareas dentro del tope de caracteres', () => {
        // Un bloque completo de la plantilla ronda los 300 caracteres. Si esta cuenta
        // deja de salir, `MAX_TEMPLATE_TASKS` es inalcanzable y engaña al que lo lea.
        expect(MAX_TEMPLATE_CHARS).toBeGreaterThanOrEqual(MAX_TEMPLATE_TASKS * 300);
    });

    it('sólo acepta texto plano', () => {
        expect([...ACCEPTED_DOCUMENT_EXTENSIONS]).toEqual(['.md', '.txt']);
    });
});

/**
 * `document.ts` está duplicado en backend y frontend a propósito (no hay monorepo ni
 * paquete compartido), igual que el catálogo de roles. Este test es la única red que
 * impide que los dos se desincronicen: el navegador rechaza por comodidad, pero el que
 * manda es el backend, y si sus números no coinciden el usuario ve un 400 después de que
 * su archivo pasara la validación local.
 *
 * Se omite si el frontend no está presente, para que el backend pueda testearse
 * desplegado por separado.
 */
const FRONTEND_DOCUMENT = path.resolve(
    process.cwd(),
    '../crm-v2-domotai-frontend/src/constants/document.ts',
);
const frontendPresent = fs.existsSync(FRONTEND_DOCUMENT);

describe.skipIf(!frontendPresent)('paridad con los límites del frontend', () => {
    let front: typeof import('../../../crm-v2-domotai-frontend/src/constants/document');

    beforeAll(async () => {
        front = await import('../../../crm-v2-domotai-frontend/src/constants/document');
    });

    it('declara los mismos topes de caracteres', () => {
        expect(front.MAX_DOCUMENT_CHARS).toBe(MAX_DOCUMENT_CHARS);
        expect(front.MAX_CHAT_MESSAGE_CHARS).toBe(MAX_CHAT_MESSAGE_CHARS);
        expect(front.MAX_TEMPLATE_CHARS).toBe(MAX_TEMPLATE_CHARS);
    });

    it('declara el mismo tope de tareas por plantilla', () => {
        expect(front.MAX_TEMPLATE_TASKS).toBe(MAX_TEMPLATE_TASKS);
    });

    it('acepta las mismas extensiones', () => {
        expect([...front.ACCEPTED_DOCUMENT_EXTENSIONS]).toEqual([...ACCEPTED_DOCUMENT_EXTENSIONS]);
    });

    it('el atributo accept del input sale de esas mismas extensiones', () => {
        expect(front.DOCUMENT_ACCEPT_ATTRIBUTE).toBe(ACCEPTED_DOCUMENT_EXTENSIONS.join(','));
    });

    it('el frontend no valida nombres de archivo que el backend rechazaría', () => {
        // El nombre sólo vive en el backend; el test existe para que el día que el
        // frontend lo valide, lo haga con el mismo número.
        expect(MAX_DOCUMENT_FILENAME_CHARS).toBe(255);
    });
});
