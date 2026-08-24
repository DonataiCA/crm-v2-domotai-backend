import {
    DEFAULT_TASK_PRIORITY,
    DEFAULT_TASK_STATUS,
    TASK_PRIORITIES,
    TASK_STATUSES,
    normalizeTaskPriority,
    normalizeTaskStatus,
    type TaskPriority,
    type TaskStatus,
} from '../constants/enums';
import { MAX_TEMPLATE_TASKS } from '../constants/document';
import { isInvertedDateRange } from '../validators/project.validator';

/**
 * Lectura de la plantilla Markdown que se sube en `POST /projects/:projectId/import-tasks`.
 *
 * Este módulo es lo contrario de `parseChatActions`: allí un modelo interpreta un texto
 * libre y el resultado no es reproducible; aquí el formato es fijo y el mismo archivo
 * produce siempre las mismas tareas, sin llamar a OpenAI. Por eso el flujo de importación
 * funciona en un entorno sin `OPENAI_API_KEY`.
 *
 * La regla que gobierna todo el archivo: **nada se descarta en silencio**. Un campo que no
 * se entiende produce un `TemplateIssue` con su número de línea, nunca una tarea a la que
 * le falta un dato. Es justo lo contrario de lo que hacen los validadores Zod con
 * `.strip()`, y es deliberado: aquí el usuario escribió ese campo a mano y espera verlo.
 *
 * Puro a propósito —sin Prisma, sin red— para que sea testeable de principio a fin. Lo que
 * necesita la base (que el `Área` exista, que el `Responsable` sea miembro) lo resuelve el
 * controlador, que añade sus propios `TemplateIssue` a los de aquí.
 */

/** Versión del formato que entiende este parser. */
export const TEMPLATE_VERSION = 1;

/** Tope de `ProjectTask.title`, el mismo de `createProjectTaskSchema`. */
const MAX_TITLE_CHARS = 500;

/** Tope de `description` y `conclusion`, el mismo de `createProjectSchema`. */
const MAX_TEXT_CHARS = 10000;

export interface ParsedTemplateTask {
    title: string;
    /** Nombre de la fase tal cual se escribió. El controlador lo resuelve a un `phaseId`. */
    phaseName: string;
    /** Nombre o email tal cual se escribió. El controlador lo resuelve a un `profileId`. */
    assigneeName: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    /** `YYYY-MM-DD` ya comprobada como fecha real. */
    startDate: string | null;
    dueDate: string | null;
    description: string | null;
    conclusion: string | null;
    /** Línea del encabezado `## `, para poder señalar la tarea en el panel. */
    line: number;
}

export interface TemplateIssue {
    line: number;
    taskTitle?: string;
    message: string;
}

export interface TemplateParseResult {
    tasks: ParsedTemplateTask[];
    issues: TemplateIssue[];
}

/**
 * Los mensajes viven aquí y no interpolados en el código para que los tests puedan
 * afirmar sobre ellos sin copiar cadenas, igual que hace `PHASE_DATE_RANGE_MESSAGE` en
 * `project.validator.ts`.
 */
export const TEMPLATE_MESSAGES = {
    unknownVersion: (version: string) =>
        `El archivo declara la versión v${version} de la plantilla y este CRM entiende la v${TEMPLATE_VERSION}. Descarga la plantilla actual.`,
    noTasks:
        'El archivo no contiene ninguna tarea. Cada tarea empieza por "## " seguido de su título.',
    tooManyTasks: (count: number) =>
        `El archivo tiene ${count} tareas y el máximo son ${MAX_TEMPLATE_TASKS}. Divídelo en varios archivos.`,
    emptyTitle: 'El encabezado "##" no tiene título.',
    titleTooLong: (length: number) =>
        `El título tiene ${length} caracteres; el máximo son ${MAX_TITLE_CHARS}.`,
    duplicateTitle: (title: string) =>
        `Ya hay otra tarea titulada "${title}" en este archivo. Los títulos deben ser distintos.`,
    missingPhase: 'Falta el campo obligatorio "Área".',
    titleAsField: 'El título de la tarea es el encabezado "## ", no un campo.',
    unknownField: (label: string) =>
        `No existe el campo "${label}". Consulta la plantilla para ver los campos válidos.`,
    duplicateField: (label: string) => `El campo "${label}" aparece dos veces en la misma tarea.`,
    unparsableLine:
        'Esta línea no tiene forma de campo. Se escribe "- **Campo:** valor".',
    strayText:
        'Este texto no pertenece a ningún campo. Lo que describe la tarea va en "- **Descripción:** ...".',
    invalidStatus: (value: string) =>
        `"${value}" no es un estado válido. Usa uno de: ${TASK_STATUSES.join(', ')}.`,
    invalidPriority: (value: string) =>
        `"${value}" no es una prioridad válida. Usa una de: ${TASK_PRIORITIES.join(', ')}.`,
    invalidDate: (label: string, value: string) =>
        `"${value}" no es una fecha válida en "${label}". El formato es AAAA-MM-DD.`,
    invertedDateRange: 'El "Vencimiento" es anterior al "Inicio".',
    textTooLong: (label: string, length: number, max: number) =>
        `El campo "${label}" tiene ${length} caracteres; el máximo son ${max}.`,
} as const;

/** Los campos de una tarea, y cómo se llaman cuando el parser habla de ellos. */
type FieldKey =
    | 'phaseName'
    | 'assigneeName'
    | 'status'
    | 'priority'
    | 'startDate'
    | 'dueDate'
    | 'description'
    | 'conclusion';

const FIELD_LABELS: Record<FieldKey, string> = {
    phaseName: 'Área',
    assigneeName: 'Responsable',
    status: 'Estado',
    priority: 'Prioridad',
    startDate: 'Inicio',
    dueDate: 'Vencimiento',
    description: 'Descripción',
    conclusion: 'Conclusión',
};

/**
 * Etiquetas aceptadas, ya normalizadas (minúsculas, sin acentos). Se aceptan las dos
 * lenguas porque la interfaz del CRM mezcla ambas y obligar a una sola sólo produciría
 * archivos rechazados por una tilde.
 */
/**
 * Traducciones que sólo valen aquí. A una IA se le pide la plantilla en español y
 * responde en español, así que la traducción es de la plantilla, no del CRM: el catálogo
 * de `constants/enums.ts` sigue hablando un único idioma y la API no cambia de contrato.
 * Lo que no esté en estas tablas cae en `normalizeTaskStatus`/`normalizeTaskPriority`,
 * que ya toleran las grafías del inglés.
 */
const SPANISH_STATUS: Record<string, TaskStatus> = {
    'pendiente': 'TODO',
    'por hacer': 'TODO',
    'sin empezar': 'TODO',
    'en progreso': 'IN_PROGRESS',
    'en curso': 'IN_PROGRESS',
    'en proceso': 'IN_PROGRESS',
    'haciendose': 'IN_PROGRESS',
    'en pausa': 'ON_HOLD',
    'pausada': 'ON_HOLD',
    'bloqueada': 'ON_HOLD',
    'detenida': 'ON_HOLD',
    'completada': 'COMPLETED',
    'completado': 'COMPLETED',
    'terminada': 'COMPLETED',
    'terminado': 'COMPLETED',
    'finalizada': 'COMPLETED',
    'hecha': 'COMPLETED',
    'hecho': 'COMPLETED',
    'lista': 'COMPLETED',
};

const SPANISH_PRIORITY: Record<string, TaskPriority> = {
    'baja': 'LOW',
    'media': 'MEDIUM',
    'normal': 'MEDIUM',
    'alta': 'HIGH',
    'urgente': 'URGENT',
    'critica': 'URGENT',
    'muy alta': 'URGENT',
};

const FIELD_ALIASES: Record<string, FieldKey> = {
    'area': 'phaseName',
    'area de trabajo': 'phaseName',
    'fase': 'phaseName',
    'phase': 'phaseName',
    'work area': 'phaseName',

    'responsable': 'assigneeName',
    'asignado': 'assigneeName',
    'asignada': 'assigneeName',
    'asignado a': 'assigneeName',
    'assignee': 'assigneeName',
    'assigned to': 'assigneeName',

    'estado': 'status',
    'status': 'status',

    'prioridad': 'priority',
    'priority': 'priority',

    'inicio': 'startDate',
    'fecha de inicio': 'startDate',
    'fecha inicio': 'startDate',
    'start': 'startDate',
    'start date': 'startDate',

    'vencimiento': 'dueDate',
    'fecha de vencimiento': 'dueDate',
    'fecha limite': 'dueDate',
    'fecha de fin': 'dueDate',
    'fin': 'dueDate',
    'due': 'dueDate',
    'due date': 'dueDate',

    'descripcion': 'description',
    'description': 'description',

    'conclusion': 'conclusion',
};

/** Etiquetas que se reconocen sólo para poder explicar por qué no van aquí. */
const TITLE_ALIASES = new Set(['titulo', 'title', 'nombre', 'name']);

/**
 * Valores que significan "este campo va vacío". El guión y la raya son lo que queda al
 * borrar el contenido de una fila de la plantilla sin borrar la fila.
 */
const EMPTY_VALUES = new Set(['', '-', '—', '–', '(vacio)', '(vacía)', '(vacia)', 'n/a', 'na']);

/**
 * `"  Fecha de Inicio "` → `"fecha de inicio"`. Se usa tanto para las etiquetas de campo
 * como para comparar nombres de fase y de persona: en los tres casos lo que se compara es
 * lo que alguien escribió a mano, y una tilde o un espacio de más no deberían decidir.
 */
export function normalizeForMatch(label: string): string {
    return label
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function isEmptyValue(value: string): boolean {
    return EMPTY_VALUES.has(normalizeForMatch(value));
}

/**
 * `YYYY-MM-DD` **y** que la fecha exista: `new Date('2026-02-30')` no lanza, se desborda
 * a marzo, así que hay que comparar los componentes de vuelta.
 */
function isValidIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

/**
 * Vacía los comentarios HTML conservando el número de líneas: los errores se reportan por
 * línea y borrarlas desplazaría todas las de abajo.
 */
function stripHtmlComments(lines: string[]): string[] {
    let inComment = false;
    return lines.map((line) => {
        let out = '';
        let rest = line;
        while (rest.length > 0) {
            if (inComment) {
                const end = rest.indexOf('-->');
                if (end === -1) return out;
                inComment = false;
                rest = rest.slice(end + 3);
                continue;
            }
            const start = rest.indexOf('<!--');
            if (start === -1) return out + rest;
            out += rest.slice(0, start);
            inComment = true;
            rest = rest.slice(start + 4);
        }
        return out;
    });
}

/** `"- **Área:** Backend"` → `{ label: 'Área', value: 'Backend' }`. */
function parseFieldLine(body: string): { label: string; value: string } | null {
    // Dos formas de negrita: los dos puntos dentro (`**Área:**`) o fuera (`**Área**:`).
    const bold = /^\*\*(.+?)\*\*\s*:?\s*([\s\S]*)$/.exec(body);
    if (bold) {
        const label = bold[1].replace(/\s*:\s*$/, '').trim();
        return label ? { label, value: bold[2].trim() } : null;
    }
    const plain = /^([^:]{1,60}?)\s*:\s*([\s\S]*)$/.exec(body);
    return plain ? { label: plain[1].trim(), value: plain[2].trim() } : null;
}

interface RawField {
    key: FieldKey;
    label: string;
    lines: string[];
    line: number;
}

interface RawBlock {
    title: string;
    line: number;
    fields: RawField[];
    issues: TemplateIssue[];
}

/**
 * La plantilla usa `## `, pero una IA a la que se le pide "una sección por tarea" devuelve
 * tan pronto `#` como `###`. El nivel no cambia el significado, así que se deduce en vez
 * de imponerlo: manda el nivel cuyos encabezados llevan campos debajo, que es lo que
 * distingue una tarea de un título de documento o de un separador de sección.
 *
 * Devuelve 2 —el de la plantilla— cuando no hay ningún encabezado con campos: así el
 * archivo se rechaza con "no contiene ninguna tarea", que es el mensaje correcto.
 */
function detectTaskLevel(lines: string[]): number {
    const withFields = new Map<number, number>();
    let level: number | null = null;
    let inFence = false;

    for (const raw of lines) {
        const trimmed = raw.trim();
        if (/^```/.test(trimmed)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;

        const indent = raw.length - raw.trimStart().length;
        if (indent >= 2 && trimmed) continue;

        const heading = /^(#{1,6})(?!#)\s*\S/.exec(trimmed);
        if (heading) {
            level = heading[1].length;
            continue;
        }
        if (level !== null && /^[-*+]\s+/.test(trimmed) && parseFieldLine(trimmed.replace(/^[-*+]\s+/, ''))) {
            withFields.set(level, (withFields.get(level) ?? 0) + 1);
            level = null;
        }
    }

    let best = 2;
    let bestCount = 0;
    for (const [candidate, count] of withFields) {
        if (count > bestCount || (count === bestCount && candidate < best)) {
            best = candidate;
            bestCount = count;
        }
    }
    return bestCount === 0 ? 2 : best;
}

/** Corta el archivo en bloques de tarea y clasifica cada línea, sin validar todavía nada. */
function splitBlocks(
    lines: string[],
    taskLevel: number,
): { blocks: RawBlock[]; issues: TemplateIssue[] } {
    const blocks: RawBlock[] = [];
    const issues: TemplateIssue[] = [];
    let block: RawBlock | null = null;
    let field: RawField | null = null;
    let inFence = false;

    const stray = (line: number) => {
        const issue: TemplateIssue = { line, message: TEMPLATE_MESSAGES.strayText };
        if (block) {
            if (block.title) issue.taskTitle = block.title;
            block.issues.push(issue);
        } else {
            issues.push(issue);
        }
    };

    lines.forEach((raw, index) => {
        const line = index + 1;
        const indent = raw.length - raw.trimStart().length;
        const trimmed = raw.trim();

        // Un bloque de código puede contener "## " y "- algo: algo" que no son ni
        // encabezados ni campos. Dentro de la valla todo es contenido.
        if (/^```/.test(trimmed)) {
            inFence = !inFence;
            if (field) field.lines.push(raw.slice(Math.min(indent, 2)));
            else if (trimmed) stray(line);
            return;
        }
        if (inFence) {
            if (field) field.lines.push(raw.slice(Math.min(indent, 2)));
            else if (trimmed) stray(line);
            return;
        }

        // Sangría de dos o más: continuación del campo anterior, siempre.
        if (indent >= 2 && trimmed) {
            if (field) field.lines.push(raw.slice(2));
            else stray(line);
            return;
        }

        const heading = /^(#{1,6})(?!#)\s*(.*)$/.exec(trimmed);
        if (heading && heading[1].length === taskLevel) {
            block = {
                title: heading[2].replace(/\s*#+\s*$/, '').trim(),
                line,
                fields: [],
                issues: [],
            };
            blocks.push(block);
            field = null;
            return;
        }
        // Cualquier otro encabezado (h1 del documento, h3 de una sección) se ignora.
        if (heading) {
            field = null;
            return;
        }

        const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
        if (bullet) {
            if (!block) {
                stray(line);
                return;
            }
            const parsed = parseFieldLine(bullet[1].trim());
            if (!parsed) {
                const issue: TemplateIssue = { line, message: TEMPLATE_MESSAGES.unparsableLine };
                if (block.title) issue.taskTitle = block.title;
                block.issues.push(issue);
                field = null;
                return;
            }

            const normalized = normalizeForMatch(parsed.label);
            if (TITLE_ALIASES.has(normalized)) {
                const issue: TemplateIssue = { line, message: TEMPLATE_MESSAGES.titleAsField };
                if (block.title) issue.taskTitle = block.title;
                block.issues.push(issue);
                field = null;
                return;
            }

            const key = FIELD_ALIASES[normalized];
            if (!key) {
                const issue: TemplateIssue = {
                    line,
                    message: TEMPLATE_MESSAGES.unknownField(parsed.label),
                };
                if (block.title) issue.taskTitle = block.title;
                block.issues.push(issue);
                field = null;
                return;
            }

            if (block.fields.some((f) => f.key === key)) {
                const issue: TemplateIssue = {
                    line,
                    message: TEMPLATE_MESSAGES.duplicateField(FIELD_LABELS[key]),
                };
                if (block.title) issue.taskTitle = block.title;
                block.issues.push(issue);
                field = null;
                return;
            }

            field = { key, label: parsed.label, lines: [parsed.value], line };
            block.fields.push(field);
            return;
        }

        // Línea suelta sin sangría: continúa el campo abierto (párrafo nuevo de una
        // descripción) o, si no hay ninguno, es texto que se habría perdido.
        if (field) {
            field.lines.push(trimmed);
            return;
        }
        if (trimmed) stray(line);
    });

    return { blocks, issues };
}

/** Valida un bloque ya troceado y lo convierte en tarea, o acumula sus problemas. */
function buildTask(block: RawBlock): { task: ParsedTemplateTask | null; issues: TemplateIssue[] } {
    const issues: TemplateIssue[] = [...block.issues];
    const at = (line: number, message: string): TemplateIssue =>
        block.title ? { line, taskTitle: block.title, message } : { line, message };

    if (!block.title) {
        issues.push(at(block.line, TEMPLATE_MESSAGES.emptyTitle));
    } else if (block.title.length > MAX_TITLE_CHARS) {
        issues.push(at(block.line, TEMPLATE_MESSAGES.titleTooLong(block.title.length)));
    }

    const values = {} as Partial<Record<FieldKey, string>>;
    for (const field of block.fields) {
        const value = field.lines.join('\n').trim();
        if (!isEmptyValue(value)) values[field.key] = value;
    }

    const lineOf = (key: FieldKey) =>
        block.fields.find((f) => f.key === key)?.line ?? block.line;

    let status: TaskStatus = DEFAULT_TASK_STATUS;
    if (values.status !== undefined) {
        const normalized =
            SPANISH_STATUS[normalizeForMatch(values.status)] ?? normalizeTaskStatus(values.status);
        if (normalized) status = normalized;
        else issues.push(at(lineOf('status'), TEMPLATE_MESSAGES.invalidStatus(values.status)));
    }

    let priority: TaskPriority = DEFAULT_TASK_PRIORITY;
    if (values.priority !== undefined) {
        const normalized =
            SPANISH_PRIORITY[normalizeForMatch(values.priority)] ?? normalizeTaskPriority(values.priority);
        if (normalized) priority = normalized;
        else issues.push(at(lineOf('priority'), TEMPLATE_MESSAGES.invalidPriority(values.priority)));
    }

    const readDate = (key: 'startDate' | 'dueDate'): string | null => {
        const value = values[key];
        if (value === undefined) return null;
        if (isValidIsoDate(value)) return value;
        issues.push(at(lineOf(key), TEMPLATE_MESSAGES.invalidDate(FIELD_LABELS[key], value)));
        return null;
    };
    const startDate = readDate('startDate');
    const dueDate = readDate('dueDate');

    if (isInvertedDateRange(startDate, dueDate)) {
        issues.push(at(block.line, TEMPLATE_MESSAGES.invertedDateRange));
    }

    const readText = (key: 'description' | 'conclusion'): string | null => {
        const value = values[key];
        if (value === undefined) return null;
        if (value.length <= MAX_TEXT_CHARS) return value;
        issues.push(
            at(
                lineOf(key),
                TEMPLATE_MESSAGES.textTooLong(FIELD_LABELS[key], value.length, MAX_TEXT_CHARS),
            ),
        );
        return null;
    };
    const description = readText('description');
    const conclusion = readText('conclusion');

    if (values.phaseName === undefined) {
        issues.push(at(block.line, TEMPLATE_MESSAGES.missingPhase));
    }

    if (issues.length > 0) return { task: null, issues };

    return {
        task: {
            title: block.title,
            phaseName: values.phaseName as string,
            assigneeName: values.assigneeName ?? null,
            status,
            priority,
            startDate,
            dueDate,
            description,
            conclusion,
            line: block.line,
        },
        issues: [],
    };
}

/**
 * Casi todas las IAs entregan el markdown dentro de una valla de código para poder
 * mostrarlo, y al copiarlo el archivo entero queda envuelto. Sin esto el parser no ve
 * ni un encabezado y responde "no contiene ninguna tarea", que desconcierta porque las
 * tareas están a la vista.
 *
 * Las dos líneas de la valla se **vacían**, no se eliminan: así los números de línea que
 * se reportan siguen siendo los del archivo que tiene el usuario delante.
 *
 * Sólo se desenvuelve si la valla abarca todo el documento y lo que queda dentro tiene
 * las vallas emparejadas, para no tocar los bloques de código de una descripción.
 */
function unwrapOuterFence(lines: string[]): string[] {
    const first = lines.findIndex((line) => line.trim() !== '');
    if (first === -1) return lines;

    let last = lines.length - 1;
    while (last > first && lines[last].trim() === '') last--;

    if (!/^```/.test(lines[first].trim()) || lines[last].trim() !== '```') return lines;

    const inner = lines.slice(first + 1, last);
    const fences = inner.filter((line) => /^\s*```/.test(line)).length;
    if (fences % 2 !== 0) return lines;

    const unwrapped = [...lines];
    unwrapped[first] = '';
    unwrapped[last] = '';
    return unwrapped;
}

export function parseTaskTemplate(rawInput: string): TemplateParseResult {
    const lines = unwrapOuterFence(rawInput.split(/\r?\n/));

    // La versión se busca sobre el texto original: después de vaciar los comentarios ya
    // no está.
    const versionLine = lines.findIndex((line) => /<!--\s*crm-domotai:tareas\s+v\d+\s*-->/i.test(line));
    if (versionLine !== -1) {
        const version = /<!--\s*crm-domotai:tareas\s+v(\d+)\s*-->/i.exec(lines[versionLine])![1];
        if (Number(version) !== TEMPLATE_VERSION) {
            return {
                tasks: [],
                issues: [
                    { line: versionLine + 1, message: TEMPLATE_MESSAGES.unknownVersion(version) },
                ],
            };
        }
    }

    const sinComentarios = stripHtmlComments(lines);
    const { blocks, issues: structuralIssues } = splitBlocks(
        sinComentarios,
        detectTaskLevel(sinComentarios),
    );

    if (blocks.length === 0) {
        return { tasks: [], issues: [{ line: 1, message: TEMPLATE_MESSAGES.noTasks }] };
    }
    if (blocks.length > MAX_TEMPLATE_TASKS) {
        return {
            tasks: [],
            issues: [{ line: 1, message: TEMPLATE_MESSAGES.tooManyTasks(blocks.length) }],
        };
    }

    const tasks: ParsedTemplateTask[] = [];
    const issues: TemplateIssue[] = [...structuralIssues];
    const seenTitles = new Set<string>();

    for (const block of blocks) {
        const key = block.title.toLowerCase();
        if (block.title && seenTitles.has(key)) {
            issues.push({
                line: block.line,
                taskTitle: block.title,
                message: TEMPLATE_MESSAGES.duplicateTitle(block.title),
            });
            continue;
        }
        if (block.title) seenTitles.add(key);

        const built = buildTask(block);
        if (built.task) tasks.push(built.task);
        issues.push(...built.issues);
    }

    return { tasks, issues };
}
