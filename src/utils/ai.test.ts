import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * Estos tests miran **lo que se le manda al modelo**, no lo que el modelo responde.
 *
 * El documento adjunto sólo existe dentro del prompt: no se guarda, no aparece en la
 * respuesta y no deja rastro en base. La única forma de comprobar que llega —y que llega
 * delimitado, y que el prompt de sistema explica qué hacer con él— es interceptar la
 * llamada a OpenAI y leer sus argumentos.
 */

const createSpy = vi.fn();

vi.mock('openai', () => ({
    default: class {
        chat = { completions: { create: createSpy } };
    },
}));

// `getOpenAI()` lanza un 503 sin clave, y el cliente se cachea en un singleton de módulo.
beforeAll(() => {
    process.env.OPENAI_API_KEY = 'sk-test';
});

const { parseChatActions } = await import('./ai');

const PHASES = [{ id: 'phase-1', name: 'Backend' }];
const MEMBERS = [{ id: 'member-1', name: 'David Altuve' }];
const PROJECT = 'CRM Domotai';

/** Devuelve los mensajes con los que se llamó a OpenAI en la última invocación. */
const lastMessages = (): Array<{ role: string; content: string }> =>
    createSpy.mock.calls.at(-1)![0].messages;

const systemPrompt = () => lastMessages()[0].content;
const userPrompt = () => lastMessages()[1].content;

beforeEach(() => {
    createSpy.mockReset();
    createSpy.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ actions: [] }) } }],
    });
});

describe('parseChatActions — sin documento adjunto', () => {
    it('manda el mensaje del usuario tal cual', async () => {
        await parseChatActions('crea una tarea de login', PHASES, MEMBERS, [], PROJECT);

        expect(userPrompt()).toBe('crea una tarea de login');
    });

    it('no menciona ningún documento en el prompt de sistema', async () => {
        await parseChatActions('crea una tarea de login', PHASES, MEMBERS, [], PROJECT);

        expect(systemPrompt()).not.toContain('DOCUMENTO ADJUNTO');
    });

    it('no deja ni un salto de línea de más donde iría el bloque del documento', async () => {
        // La interpolación vacía es fácil que cuele una línea en blanco extra. El prompt
        // sin documento tiene que quedar exactamente como estaba antes de esta función.
        await parseChatActions('crea una tarea de login', PHASES, MEMBERS, [], PROJECT);

        expect(systemPrompt()).toContain('(ninguna)\n\nPara CREATE incluye');
    });

    it('conserva las reglas de siempre: sigue permitiendo update', async () => {
        await parseChatActions('asigna las de TODO a David', PHASES, MEMBERS, [], PROJECT);

        expect(systemPrompt()).toContain('REGLAS CRÍTICAS');
        expect(systemPrompt()).toContain('"update" — modificar una tarea EXISTENTE');
        expect(systemPrompt()).not.toContain('NUNCA emitas "update"');
    });
});

describe('parseChatActions — con documento adjunto', () => {
    const DOC = {
        fileName: 'sprint-plan.md',
        content: '# Sprint 4\n## Backend\n- Migrar el schema\n- Endpoint de login',
    };

    it('envuelve el contenido entre delimitadores y nombra el archivo', async () => {
        await parseChatActions('sólo la parte de backend', PHASES, MEMBERS, [], PROJECT, DOC);

        expect(userPrompt()).toContain('--- DOCUMENTO ADJUNTO: sprint-plan.md ---');
        expect(userPrompt()).toContain('--- FIN DEL DOCUMENTO ---');
        expect(userPrompt()).toContain('- Migrar el schema');
    });

    it('pone la instrucción del usuario antes del documento', async () => {
        await parseChatActions('sólo la parte de backend', PHASES, MEMBERS, [], PROJECT, DOC);

        const prompt = userPrompt();
        expect(prompt.indexOf('sólo la parte de backend')).toBeLessThan(
            prompt.indexOf('--- DOCUMENTO ADJUNTO'),
        );
    });

    it('deja el contenido entre los dos delimitadores, en ese orden', async () => {
        await parseChatActions('', PHASES, MEMBERS, [], PROJECT, DOC);

        const prompt = userPrompt();
        const abre = prompt.indexOf('--- DOCUMENTO ADJUNTO');
        const cuerpo = prompt.indexOf('- Endpoint de login');
        const cierra = prompt.indexOf('--- FIN DEL DOCUMENTO ---');

        expect(abre).toBeLessThan(cuerpo);
        expect(cuerpo).toBeLessThan(cierra);
    });

    it('usa una instrucción por defecto cuando el usuario no escribe nada', async () => {
        await parseChatActions('', PHASES, MEMBERS, [], PROJECT, DOC);

        expect(userPrompt()).toContain('Crea las tareas que describe el documento adjunto.');
    });

    it('trata un mensaje de sólo espacios como si estuviera vacío', async () => {
        await parseChatActions('   ', PHASES, MEMBERS, [], PROJECT, DOC);

        expect(userPrompt()).toContain('Crea las tareas que describe el documento adjunto.');
    });

    it('añade al prompt de sistema el bloque que explica qué es el documento', async () => {
        await parseChatActions('', PHASES, MEMBERS, [], PROJECT, DOC);

        expect(systemPrompt()).toContain('DOCUMENTO ADJUNTO:');
    });

    it('prohíbe que el contenido del documento dispare updates', async () => {
        await parseChatActions('', PHASES, MEMBERS, [], PROJECT, DOC);

        expect(systemPrompt()).toContain('NUNCA emitas "update"');
    });

    it('pide agrupar en vez de emitir microtareas, con un tope de 20', async () => {
        await parseChatActions('', PHASES, MEMBERS, [], PROJECT, DOC);

        expect(systemPrompt()).toContain('Máximo 20 tareas');
    });

    it('avisa de no crear una tarea con el nombre del archivo', async () => {
        await parseChatActions('', PHASES, MEMBERS, [], PROJECT, DOC);

        expect(systemPrompt()).toContain('NO crees una tarea cuyo título sea el nombre del archivo');
    });
});

describe('parseChatActions — el documento no altera el resto del contexto', () => {
    it('sigue mandando fases, miembros y nombre del proyecto', async () => {
        await parseChatActions('', PHASES, MEMBERS, [], PROJECT, {
            fileName: 'a.md',
            content: '# Hola',
        });

        expect(systemPrompt()).toContain('"Backend" (ID: phase-1)');
        expect(systemPrompt()).toContain('"David Altuve" (ID: member-1)');
        expect(systemPrompt()).toContain(PROJECT);
    });

    it('no cambia el modelo ni los parámetros de la llamada', async () => {
        await parseChatActions('', PHASES, MEMBERS, [], PROJECT, {
            fileName: 'a.md',
            content: '# Hola',
        });

        const args = createSpy.mock.calls.at(-1)![0];
        expect(args.model).toBe('gpt-4o');
        expect(args.max_tokens).toBe(4000);
        expect(args.response_format).toEqual({ type: 'json_object' });
    });
});
