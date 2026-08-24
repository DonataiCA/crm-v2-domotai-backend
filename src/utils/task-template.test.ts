import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    parseTaskTemplate,
    TEMPLATE_MESSAGES,
    TEMPLATE_VERSION,
} from './task-template';
import { MAX_TEMPLATE_TASKS } from '../constants/document';

/**
 * `parseTaskTemplate` es la única pieza que decide qué llega a la base cuando se importa
 * un archivo, así que estos tests son el contrato de la plantilla que se publica en
 * `public/plantilla-tareas.md`. Si un caso de aquí cambia, la plantilla cambia con él.
 *
 * La regla que atraviesa todo el archivo: **nada se descarta en silencio**. Un campo mal
 * escrito produce un `issue` con su línea, no una tarea a la que le falta un dato.
 */

/** La plantilla tal y como se publica, con las dos tareas de ejemplo. */
const FULL_TEMPLATE = `<!-- crm-domotai:tareas v1 -->
# Tareas

<!--
  Un bloque "## " por tarea. Borra este comentario antes de subir el archivo.
-->

## Configurar el pipeline de CI

- **Área:** DevOps & Deploy
- **Responsable:** David Altuve
- **Estado:** IN_PROGRESS
- **Prioridad:** HIGH
- **Inicio:** 2026-08-20
- **Vencimiento:** 2026-08-27
- **Descripción:** Montar GitHub Actions con lint, typecheck y tests.
- **Conclusión:** Pipeline verde en main.

## Endpoint de login con JWT

- **Área:** Backend Development
- **Prioridad:** URGENT
`;

/** Un bloque mínimo válido al que los tests le van añadiendo o cambiando campos. */
const task = (body: string, title = 'Una tarea') =>
    `## ${title}\n\n- **Área:** Backend\n${body}\n`;

describe('parseTaskTemplate — la plantilla completa', () => {
    const result = parseTaskTemplate(FULL_TEMPLATE);

    it('no reporta ningún problema', () => {
        expect(result.issues).toEqual([]);
    });

    it('devuelve una tarea por cada bloque "## "', () => {
        expect(result.tasks).toHaveLength(2);
    });

    it('lee todos los campos de la primera tarea', () => {
        expect(result.tasks[0]).toMatchObject({
            title: 'Configurar el pipeline de CI',
            phaseName: 'DevOps & Deploy',
            assigneeName: 'David Altuve',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            startDate: '2026-08-20',
            dueDate: '2026-08-27',
            description: 'Montar GitHub Actions con lint, typecheck y tests.',
            conclusion: 'Pipeline verde en main.',
        });
    });

    it('aplica los valores por defecto a los campos omitidos', () => {
        expect(result.tasks[1]).toMatchObject({
            title: 'Endpoint de login con JWT',
            phaseName: 'Backend Development',
            assigneeName: null,
            status: 'TODO',
            priority: 'URGENT',
            startDate: null,
            dueDate: null,
            description: null,
            conclusion: null,
        });
    });

    it('apunta la línea del encabezado de cada tarea', () => {
        // El encabezado de la primera tarea es la línea 8 del literal de arriba.
        expect(result.tasks[0].line).toBe(8);
        expect(result.tasks[1].line).toBe(19);
    });

    it('ignora el h1 y los comentarios HTML', () => {
        expect(result.tasks.map(t => t.title)).not.toContain('Tareas');
    });
});

describe('parseTaskTemplate — marcador de versión', () => {
    it('acepta el archivo sin marcador', () => {
        const result = parseTaskTemplate(task('- **Prioridad:** LOW'));
        expect(result.issues).toEqual([]);
        expect(result.tasks).toHaveLength(1);
    });

    it('rechaza una versión que este parser no conoce, sin devolver tareas', () => {
        const raw = `<!-- crm-domotai:tareas v99 -->\n${task('')}`;
        const result = parseTaskTemplate(raw);
        expect(result.tasks).toEqual([]);
        expect(result.issues).toEqual([
            { line: 1, message: TEMPLATE_MESSAGES.unknownVersion('99') },
        ]);
    });

    it('acepta la versión que publica la plantilla', () => {
        const raw = `<!-- crm-domotai:tareas v${TEMPLATE_VERSION} -->\n${task('')}`;
        expect(parseTaskTemplate(raw).issues).toEqual([]);
    });
});

describe('parseTaskTemplate — formas del campo', () => {
    it.each([
        ['- **Estado:** ON_HOLD', 'negrita con los dos puntos dentro'],
        ['- **Estado**: ON_HOLD', 'negrita con los dos puntos fuera'],
        ['- Estado: ON_HOLD', 'sin negrita'],
        ['* **Estado:** ON_HOLD', 'viñeta con asterisco'],
        ['-   **Estado:**   ON_HOLD  ', 'espacios de sobra'],
    ])('acepta %s (%s)', (line) => {
        const result = parseTaskTemplate(task(line));
        expect(result.issues).toEqual([]);
        expect(result.tasks[0].status).toBe('ON_HOLD');
    });

    it.each([
        ['Área', 'phaseName', 'Backend'],
        ['Fase', 'phaseName', 'Backend'],
        ['Phase', 'phaseName', 'Backend'],
        ['Responsable', 'assigneeName', 'Ana'],
        ['Asignado', 'assigneeName', 'Ana'],
        ['Assignee', 'assigneeName', 'Ana'],
        ['Descripción', 'description', 'Texto'],
        ['Descripcion', 'description', 'Texto'],
        ['Description', 'description', 'Texto'],
        ['Conclusión', 'conclusion', 'Texto'],
        ['Conclusion', 'conclusion', 'Texto'],
    ])('reconoce el alias "%s" como %s', (label, field, value) => {
        // El "Área" es obligatoria, así que sólo se añade cuando no es la que se prueba.
        const base = field === 'phaseName' ? '' : '- **Área:** Backend\n';
        const raw = `## Una tarea\n\n${base}- **${label}:** ${value}\n`;
        const result = parseTaskTemplate(raw);
        expect(result.issues).toEqual([]);
        expect(result.tasks[0][field as 'phaseName']).toBe(value);
    });

    it.each([
        ['Inicio', 'startDate'],
        ['Fecha de inicio', 'startDate'],
        ['Start date', 'startDate'],
        ['Vencimiento', 'dueDate'],
        ['Fecha límite', 'dueDate'],
        ['Due date', 'dueDate'],
    ])('reconoce el alias de fecha "%s" como %s', (label, field) => {
        const raw = `## Una tarea\n\n- **Área:** Backend\n- **${label}:** 2026-09-01\n`;
        const result = parseTaskTemplate(raw);
        expect(result.issues).toEqual([]);
        expect(result.tasks[0][field as 'startDate']).toBe('2026-09-01');
    });

    it.each(['', '—', '-', '–', '(vacío)', 'N/A'])(
        'trata el valor "%s" como campo ausente',
        (value) => {
            const result = parseTaskTemplate(task(`- **Responsable:** ${value}`));
            expect(result.issues).toEqual([]);
            expect(result.tasks[0].assigneeName).toBeNull();
        },
    );

    it('continúa el valor en las líneas indentadas que le siguen', () => {
        const raw = [
            '## Una tarea',
            '',
            '- **Área:** Backend',
            '- **Descripción:** Primera línea.',
            '  Segunda línea.',
            '',
            '  - un punto',
            '  - otro punto',
            '- **Prioridad:** LOW',
        ].join('\n');
        const result = parseTaskTemplate(raw);
        expect(result.issues).toEqual([]);
        expect(result.tasks[0].description).toBe(
            'Primera línea.\nSegunda línea.\n\n- un punto\n- otro punto',
        );
        expect(result.tasks[0].priority).toBe('LOW');
    });

    it('no confunde con campos las líneas dentro de un bloque de código', () => {
        const raw = [
            '## Una tarea',
            '',
            '- **Área:** Backend',
            '- **Descripción:** Ejecutar:',
            '',
            '```md',
            '## No soy una tarea',
            '- Estado: TAMPOCO SOY UN CAMPO',
            '```',
        ].join('\n');
        const result = parseTaskTemplate(raw);
        expect(result.issues).toEqual([]);
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].description).toContain('## No soy una tarea');
    });
});

describe('parseTaskTemplate — problemas de estructura', () => {
    it('reporta un archivo sin ningún bloque "## "', () => {
        const result = parseTaskTemplate('# Tareas\n\nAquí no hay nada.\n');
        expect(result.tasks).toEqual([]);
        expect(result.issues).toEqual([{ line: 1, message: TEMPLATE_MESSAGES.noTasks }]);
    });

    it('reporta un archivo vacío', () => {
        expect(parseTaskTemplate('   \n\n').issues).toEqual([
            { line: 1, message: TEMPLATE_MESSAGES.noTasks },
        ]);
    });

    it('reporta más tareas de las permitidas y no devuelve ninguna', () => {
        const raw = Array.from(
            { length: MAX_TEMPLATE_TASKS + 1 },
            (_, i) => `## Tarea ${i}\n\n- **Área:** Backend\n`,
        ).join('\n');
        const result = parseTaskTemplate(raw);
        expect(result.tasks).toEqual([]);
        expect(result.issues).toEqual([
            { line: 1, message: TEMPLATE_MESSAGES.tooManyTasks(MAX_TEMPLATE_TASKS + 1) },
        ]);
    });

    it('acepta justo el máximo de tareas', () => {
        const raw = Array.from(
            { length: MAX_TEMPLATE_TASKS },
            (_, i) => `## Tarea ${i}\n\n- **Área:** Backend\n`,
        ).join('\n');
        const result = parseTaskTemplate(raw);
        expect(result.issues).toEqual([]);
        expect(result.tasks).toHaveLength(MAX_TEMPLATE_TASKS);
    });

    it('reporta dos tareas con el mismo título en el mismo archivo', () => {
        const raw = `${task('', 'Repetida')}\n${task('', 'Repetida')}`;
        const result = parseTaskTemplate(raw);
        // Sobrevive la primera; la que sobra es la segunda.
        expect(result.tasks.map(t => t.title)).toEqual(['Repetida']);
        expect(result.issues).toEqual([
            {
                line: 6,
                taskTitle: 'Repetida',
                message: TEMPLATE_MESSAGES.duplicateTitle('Repetida'),
            },
        ]);
    });

    it('reporta el texto suelto que no pertenece a ningún campo', () => {
        const raw = '## Una tarea\n\nEsto no es un campo.\n\n- **Área:** Backend\n';
        const result = parseTaskTemplate(raw);
        expect(result.tasks).toEqual([]);
        expect(result.issues).toContainEqual({
            line: 3,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.strayText,
        });
    });

    it('reporta una viñeta que no tiene forma de campo', () => {
        const result = parseTaskTemplate(task('- esto no lleva dos puntos'));
        expect(result.tasks).toEqual([]);
        expect(result.issues).toContainEqual({
            line: 4,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.unparsableLine,
        });
    });
});

describe('parseTaskTemplate — problemas de campo', () => {
    it('reporta una etiqueta desconocida en vez de descartarla', () => {
        const result = parseTaskTemplate(task('- **Esfuerzo:** 3 días'));
        expect(result.tasks).toEqual([]);
        expect(result.issues).toContainEqual({
            line: 4,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.unknownField('Esfuerzo'),
        });
    });

    it('reporta el título escrito como campo', () => {
        const result = parseTaskTemplate(task('- **Título:** Otro título'));
        expect(result.issues).toContainEqual({
            line: 4,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.titleAsField,
        });
    });

    it('reporta un campo repetido dentro de la misma tarea', () => {
        const result = parseTaskTemplate(task('- **Prioridad:** LOW\n- **Prioridad:** HIGH'));
        expect(result.issues).toContainEqual({
            line: 5,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.duplicateField('Prioridad'),
        });
    });

    it('reporta una tarea sin Área', () => {
        const result = parseTaskTemplate('## Una tarea\n\n- **Prioridad:** LOW\n');
        expect(result.tasks).toEqual([]);
        expect(result.issues).toContainEqual({
            line: 1,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.missingPhase,
        });
    });

    it('reporta un encabezado "## " sin texto', () => {
        const result = parseTaskTemplate('##\n\n- **Área:** Backend\n');
        expect(result.issues).toContainEqual({
            line: 1,
            message: TEMPLATE_MESSAGES.emptyTitle,
        });
    });

    it('reporta un título más largo de lo que acepta la base', () => {
        const long = 'a'.repeat(501);
        const result = parseTaskTemplate(task('', long));
        expect(result.issues).toContainEqual({
            line: 1,
            taskTitle: long,
            message: TEMPLATE_MESSAGES.titleTooLong(501),
        });
    });
});

describe('parseTaskTemplate — catálogos', () => {
    it.each(['TODO', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'])(
        'acepta el estado canónico %s',
        (status) => {
            const result = parseTaskTemplate(task(`- **Estado:** ${status}`));
            expect(result.issues).toEqual([]);
            expect(result.tasks[0].status).toBe(status);
        },
    );

    it.each([
        ['In Progress', 'IN_PROGRESS'],
        ['done', 'COMPLETED'],
        ['blocked', 'ON_HOLD'],
    ])('normaliza el estado "%s" a %s', (written, expected) => {
        const result = parseTaskTemplate(task(`- **Estado:** ${written}`));
        expect(result.issues).toEqual([]);
        expect(result.tasks[0].status).toBe(expected);
    });

    it('reporta un estado fuera del catálogo', () => {
        // "HECHO" ya no vale como ejemplo de inválido: desde que la plantilla acepta
        // español es un alias de COMPLETED. Hace falta algo que no signifique nada.
        const result = parseTaskTemplate(task('- **Estado:** a medias'));
        expect(result.tasks).toEqual([]);
        expect(result.issues).toContainEqual({
            line: 4,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.invalidStatus('a medias'),
        });
    });

    it('acepta HECHO como el COMPLETED que quiere decir', () => {
        const result = parseTaskTemplate(task('- **Estado:** HECHO'));
        expect(result.issues).toEqual([]);
        expect(result.tasks[0].status).toBe('COMPLETED');
    });

    it.each(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])('acepta la prioridad %s', (priority) => {
        const result = parseTaskTemplate(task(`- **Prioridad:** ${priority}`));
        expect(result.issues).toEqual([]);
        expect(result.tasks[0].priority).toBe(priority);
    });

    it('reporta una prioridad fuera del catálogo', () => {
        const result = parseTaskTemplate(task('- **Prioridad:** cuando se pueda'));
        expect(result.tasks).toEqual([]);
        expect(result.issues).toContainEqual({
            line: 4,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.invalidPriority('cuando se pueda'),
        });
    });

    it('acepta ALTA como el HIGH que quiere decir', () => {
        const result = parseTaskTemplate(task('- **Prioridad:** ALTA'));
        expect(result.issues).toEqual([]);
        expect(result.tasks[0].priority).toBe('HIGH');
    });
});

describe('parseTaskTemplate — fechas', () => {
    it.each(['20/08/2026', '2026-8-20', 'mañana', '2026-13-01', '2026-02-30'])(
        'reporta la fecha inválida "%s"',
        (value) => {
            const result = parseTaskTemplate(task(`- **Inicio:** ${value}`));
            expect(result.tasks).toEqual([]);
            expect(result.issues).toContainEqual({
                line: 4,
                taskTitle: 'Una tarea',
                message: TEMPLATE_MESSAGES.invalidDate('Inicio', value),
            });
        },
    );

    it('acepta un 29 de febrero de año bisiesto', () => {
        const result = parseTaskTemplate(task('- **Inicio:** 2028-02-29'));
        expect(result.issues).toEqual([]);
        expect(result.tasks[0].startDate).toBe('2028-02-29');
    });

    it('reporta un rango invertido', () => {
        const result = parseTaskTemplate(
            task('- **Inicio:** 2026-09-10\n- **Vencimiento:** 2026-09-01'),
        );
        expect(result.tasks).toEqual([]);
        expect(result.issues).toContainEqual({
            line: 1,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.invertedDateRange,
        });
    });

    it('acepta un rango de un solo día', () => {
        const result = parseTaskTemplate(
            task('- **Inicio:** 2026-09-01\n- **Vencimiento:** 2026-09-01'),
        );
        expect(result.issues).toEqual([]);
    });
});

describe('parseTaskTemplate — topes de texto', () => {
    it('reporta una descripción más larga de lo que acepta la base', () => {
        const long = 'a'.repeat(10001);
        const result = parseTaskTemplate(task(`- **Descripción:** ${long}`));
        expect(result.tasks).toEqual([]);
        expect(result.issues).toContainEqual({
            line: 4,
            taskTitle: 'Una tarea',
            message: TEMPLATE_MESSAGES.textTooLong('Descripción', 10001, 10000),
        });
    });

    it('acepta justo el tope', () => {
        const result = parseTaskTemplate(task(`- **Descripción:** ${'a'.repeat(10000)}`));
        expect(result.issues).toEqual([]);
    });
});

describe('parseTaskTemplate — una tarea con problemas no llega a la lista', () => {
    it('devuelve las buenas y reporta las malas por separado', () => {
        const raw = [
            '## Buena',
            '',
            '- **Área:** Backend',
            '',
            '## Mala',
            '',
            '- **Área:** Backend',
            '- **Prioridad:** ALTÍSIMA',
        ].join('\n');
        const result = parseTaskTemplate(raw);
        expect(result.tasks.map(t => t.title)).toEqual(['Buena']);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].taskTitle).toBe('Mala');
    });
});

/**
 * La plantilla que se descarga desde el panel vive en el repositorio del frontend, y es
 * el único ejemplo de este formato que ve un usuario. Este test la lee de verdad: si el
 * parser y la plantilla se separan, el archivo que reparte el CRM deja de importarse.
 *
 * Se omite si el frontend no está presente, para que el backend pueda testearse
 * desplegado por separado.
 */
const PUBLISHED_TEMPLATE = path.resolve(
    process.cwd(),
    '../crm-v2-domotai-frontend/public/plantilla-tareas.md',
);
const templatePresent = fs.existsSync(PUBLISHED_TEMPLATE);

describe.skipIf(!templatePresent)('la plantilla que se publica en el frontend', () => {
    const raw = templatePresent ? fs.readFileSync(PUBLISHED_TEMPLATE, 'utf8') : '';

    it('declara la versión que este parser entiende', () => {
        expect(raw).toContain(`<!-- crm-domotai:tareas v${TEMPLATE_VERSION} -->`);
    });

    it('se importa sin un solo problema', () => {
        expect(parseTaskTemplate(raw).issues).toEqual([]);
    });

    it('sus tareas de ejemplo usan todos los campos de la plantilla', () => {
        const [primera] = parseTaskTemplate(raw).tasks;

        // Si un campo deja de aparecer en el ejemplo, nadie sabrá que existe.
        expect(primera.phaseName).toBeTruthy();
        expect(primera.assigneeName).toBeTruthy();
        expect(primera.startDate).toBeTruthy();
        expect(primera.dueDate).toBeTruthy();
        expect(primera.description).toBeTruthy();
        expect(primera.status).toBeTruthy();
        expect(primera.priority).toBeTruthy();
    });

    it('las instrucciones van en comentarios HTML y no se cuelan como tareas', () => {
        const titles = parseTaskTemplate(raw).tasks.map(t => t.title);

        expect(titles).not.toContain('Tareas');
        expect(titles.every(t => !t.includes('OBLIGATORIO'))).toBe(true);
    });
});

describe('parseTaskTemplate — tolerancia con lo que devuelve otra IA', () => {
    /**
     * Casi todas las IAs entregan el markdown dentro de una valla de código para
     * poder mostrarlo. Copiado tal cual, el archivo entero quedaba "dentro" de la
     * valla y el parser no veía ni un encabezado: fallaba con "no contiene ninguna
     * tarea", que es el error más desconcertante posible porque las tareas están
     * a la vista.
     */
    it('desenvuelve el documento cuando toda la plantilla viene en una valla de código', () => {
        const envuelto = ['```markdown', FULL_TEMPLATE, '```'].join('\n');

        const result = parseTaskTemplate(envuelto);

        expect(result.issues).toEqual([]);
        expect(result.tasks.map((t) => t.title)).toEqual([
            'Configurar el pipeline de CI',
            'Endpoint de login con JWT',
        ]);
    });

    it('desenvuelve también una valla sin lenguaje declarado', () => {
        const envuelto = ['```', FULL_TEMPLATE, '```'].join('\n');

        expect(parseTaskTemplate(envuelto).tasks).toHaveLength(2);
    });

    it('no toca las vallas que van dentro de una descripción', () => {
        const conCodigo = [
            '## Documentar el arranque',
            '',
            '- **Área:** DevOps',
            '- **Descripción:** Ejecutar:',
            '',
            '  ```bash',
            '  npm run dev',
            '  ```',
        ].join('\n');

        const result = parseTaskTemplate(conCodigo);

        expect(result.issues).toEqual([]);
        expect(result.tasks[0].description).toContain('npm run dev');
    });
});

describe('parseTaskTemplate — nivel del encabezado de tarea', () => {
    /**
     * La plantilla usa "## ", pero una IA a la que se le pide "una sección por tarea"
     * devuelve tan pronto "#" como "###". El nivel exacto no cambia el significado, así
     * que se deduce: manda el nivel cuyos encabezados llevan campos debajo.
     */
    it('detecta las tareas cuando la IA usó ###', () => {
        const md = [
            '# Tareas del sprint',
            '',
            '### Migrar el schema',
            '',
            '- **Área:** Backend',
            '',
            '### Publicar la release',
            '',
            '- **Área:** DevOps',
        ].join('\n');

        const result = parseTaskTemplate(md);

        expect(result.issues).toEqual([]);
        expect(result.tasks.map((t) => t.title)).toEqual(['Migrar el schema', 'Publicar la release']);
    });

    it('detecta las tareas cuando cada una es un "#"', () => {
        const md = [
            '# Migrar el schema',
            '',
            '- **Área:** Backend',
            '',
            '# Publicar la release',
            '',
            '- **Área:** DevOps',
        ].join('\n');

        expect(parseTaskTemplate(md).tasks).toHaveLength(2);
    });

    /** El "# Tareas" de la plantilla no es una tarea: no lleva campos debajo. */
    it('ignora el título del documento y se queda con el nivel que tiene campos', () => {
        const result = parseTaskTemplate(FULL_TEMPLATE);

        expect(result.tasks.map((t) => t.title)).toEqual([
            'Configurar el pipeline de CI',
            'Endpoint de login con JWT',
        ]);
    });

    it('sigue rechazando un archivo sin ningún encabezado con campos', () => {
        const md = ['# Notas sueltas', '', 'Esto no es una plantilla.'].join('\n');

        const result = parseTaskTemplate(md);

        expect(result.tasks).toEqual([]);
        expect(result.issues.some((i) => i.message === TEMPLATE_MESSAGES.noTasks)).toBe(true);
    });
});

describe('parseTaskTemplate — estado y prioridad en español', () => {
    /**
     * Se le pide a una IA en español que rellene "Estado" y "Prioridad" y responde en
     * español. Rechazarlo obligaba a traducir a mano un vocabulario que el CRM ya sabe
     * mostrar traducido.
     */
    const conCampo = (campo: string, valor: string) =>
        parseTaskTemplate(['## T', '', '- **Área:** A', `- **${campo}:** ${valor}`].join('\n'));

    it.each([
        ['Pendiente', 'TODO'],
        ['En progreso', 'IN_PROGRESS'],
        ['En curso', 'IN_PROGRESS'],
        ['En pausa', 'ON_HOLD'],
        ['Completada', 'COMPLETED'],
        ['Terminada', 'COMPLETED'],
        ['Hecha', 'COMPLETED'],
    ])('traduce el estado "%s" a %s', (entrada, esperado) => {
        const result = conCampo('Estado', entrada);

        expect(result.issues).toEqual([]);
        expect(result.tasks[0].status).toBe(esperado);
    });

    it.each([
        ['Baja', 'LOW'],
        ['Media', 'MEDIUM'],
        ['Alta', 'HIGH'],
        ['Urgente', 'URGENT'],
        ['Crítica', 'URGENT'],
    ])('traduce la prioridad "%s" a %s', (entrada, esperado) => {
        const result = conCampo('Prioridad', entrada);

        expect(result.issues).toEqual([]);
        expect(result.tasks[0].priority).toBe(esperado);
    });

    it('sigue rechazando un estado que no significa nada', () => {
        const result = conCampo('Estado', 'a medio hacer');

        expect(result.tasks).toEqual([]);
        expect(result.issues[0].message).toBe(TEMPLATE_MESSAGES.invalidStatus('a medio hacer'));
    });
});
