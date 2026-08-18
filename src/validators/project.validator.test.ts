import { describe, it, expect } from 'vitest';

import { chatTaskSchema } from './project.validator';
import { MAX_CHAT_MESSAGE_CHARS, MAX_DOCUMENT_CHARS } from '../constants/document';

/**
 * `chatTaskSchema` valida el cuerpo de `POST /projects/:projectId/chat-task`, que
 * acepta una instrucción escrita, un documento arrastrado, o ambos. Cualquiera de los
 * dos por separado es un cuerpo válido; ninguno de los dos, no.
 */

const doc = (overrides: Partial<{ fileName: string; content: string }> = {}) => ({
    fileName: 'sprint-plan.md',
    content: '# Sprint 4\n\n- Migrar el schema',
    ...overrides,
});

/** Devuelve los mensajes de error de un parseo fallido, para afirmar sobre ellos. */
const errorsOf = (input: unknown): string[] => {
    const result = chatTaskSchema.safeParse(input);
    if (result.success) throw new Error('Se esperaba que el parseo fallara, y ha pasado');
    return result.error.issues.map((issue) => issue.message);
};

describe('chatTaskSchema — presencia de mensaje o documento', () => {
    it('acepta sólo el mensaje, que es el uso de hoy', () => {
        const result = chatTaskSchema.safeParse({ message: 'crea una tarea de login' });

        expect(result.success).toBe(true);
    });

    it('acepta sólo el documento: arrastrar un .md sin escribir nada es válido', () => {
        const result = chatTaskSchema.safeParse({ document: doc() });

        expect(result.success).toBe(true);
    });

    it('acepta mensaje y documento juntos', () => {
        const result = chatTaskSchema.safeParse({
            message: 'sólo las tareas de la fase 2',
            document: doc(),
        });

        expect(result.success).toBe(true);
    });

    it('rechaza un cuerpo sin mensaje ni documento', () => {
        expect(errorsOf({})).toContain('A message or a document is required');
    });

    it('rechaza un mensaje en blanco sin documento: los espacios no cuentan', () => {
        expect(errorsOf({ message: '   ' })).toContain('A message or a document is required');
    });

    it('no exige mensaje cuando hay documento, por corto que sea', () => {
        const result = chatTaskSchema.safeParse({
            message: '',
            document: doc({ content: '#' }),
        });

        expect(result.success).toBe(true);
    });
});

describe('chatTaskSchema — límites de longitud', () => {
    it(`acepta un documento de exactamente ${MAX_DOCUMENT_CHARS} caracteres`, () => {
        const result = chatTaskSchema.safeParse({
            document: doc({ content: 'a'.repeat(MAX_DOCUMENT_CHARS) }),
        });

        expect(result.success).toBe(true);
    });

    it('rechaza un documento de un caracter más', () => {
        const result = chatTaskSchema.safeParse({
            document: doc({ content: 'a'.repeat(MAX_DOCUMENT_CHARS + 1) }),
        });

        expect(result.success).toBe(false);
    });

    it('rechaza un documento vacío: un archivo sin contenido no es un adjunto', () => {
        const result = chatTaskSchema.safeParse({ document: doc({ content: '' }) });

        expect(result.success).toBe(false);
    });

    it(`acepta un mensaje de exactamente ${MAX_CHAT_MESSAGE_CHARS} caracteres y rechaza uno más`, () => {
        expect(chatTaskSchema.safeParse({ message: 'a'.repeat(MAX_CHAT_MESSAGE_CHARS) }).success).toBe(true);
        expect(chatTaskSchema.safeParse({ message: 'a'.repeat(MAX_CHAT_MESSAGE_CHARS + 1) }).success).toBe(false);
    });

    it('rechaza un nombre de archivo vacío o de más de 255 caracteres', () => {
        expect(chatTaskSchema.safeParse({ document: doc({ fileName: '' }) }).success).toBe(false);
        expect(chatTaskSchema.safeParse({ document: doc({ fileName: 'a'.repeat(256) }) }).success).toBe(false);
        expect(chatTaskSchema.safeParse({ document: doc({ fileName: 'a'.repeat(255) }) }).success).toBe(true);
    });
});

describe('chatTaskSchema — campos desconocidos', () => {
    it('descarta en silencio los campos desconocidos de la raíz', () => {
        const result = chatTaskSchema.safeParse({
            message: 'crea una tarea',
            projectId: 'no-debería-llegar',
        });

        expect(result.success).toBe(true);
        expect(result.success && result.data).not.toHaveProperty('projectId');
    });

    it('descarta en silencio los campos desconocidos dentro de document', () => {
        const result = chatTaskSchema.safeParse({
            document: { ...doc(), mimeType: 'text/markdown', size: 2048 },
        });

        expect(result.success).toBe(true);
        expect(result.success && result.data.document).not.toHaveProperty('mimeType');
        expect(result.success && result.data.document).not.toHaveProperty('size');
    });

    it('conserva intactos los campos conocidos', () => {
        const result = chatTaskSchema.safeParse({ message: 'hola', document: doc() });

        expect(result.success && result.data).toEqual({
            message: 'hola',
            document: { fileName: 'sprint-plan.md', content: '# Sprint 4\n\n- Migrar el schema' },
        });
    });
});

describe('chatTaskSchema — tipos', () => {
    it('rechaza un documento incompleto', () => {
        expect(chatTaskSchema.safeParse({ document: { fileName: 'a.md' } }).success).toBe(false);
        expect(chatTaskSchema.safeParse({ document: { content: '# Hola' } }).success).toBe(false);
    });

    it('rechaza un mensaje que no es una cadena', () => {
        expect(chatTaskSchema.safeParse({ message: 42 }).success).toBe(false);
        expect(chatTaskSchema.safeParse({ message: { texto: 'hola' } }).success).toBe(false);
    });
});
