import {
    normalizeForMatch,
    type ParsedTemplateTask,
    type TemplateIssue,
} from './task-template';
import type { TaskPriority, TaskStatus } from '../constants/enums';

/**
 * Segundo tramo de `POST /projects/:projectId/import-tasks`: traduce lo que el usuario
 * escribió en la plantilla (nombres de fase, nombres de persona) a las claves ajenas que
 * espera `ProjectTask`.
 *
 * Va aparte de `task-template.ts` porque son dos decisiones distintas —"esto está bien
 * escrito" y "esto existe en este proyecto"— y aparte del controlador porque así sigue
 * siendo puro: recibe el contexto ya leído de la base y no toca Prisma. Todos los caminos
 * de fallo se prueban sin levantar Postgres.
 *
 * Nada se resuelve en silencio, pero no todo bloquea. Un archivo escrito por otra IA
 * acierta el formato y falla los nombres propios del proyecto, así que un `Área` que no
 * existe coloca la tarea en la primera fase y un `Responsable` que no es miembro la deja
 * sin asignar: en ambos casos se emite un **aviso** con su línea y la tarea se crea,
 * porque recolocarla en el tablero cuesta dos clics y rehacer el archivo no.
 *
 * Lo que sí detiene el import entero es aquello que no tiene arreglo razonable al vuelo:
 * un proyecto sin ninguna fase donde colocar nada, o un título que ya existe y crearía un
 * duplicado indistinguible.
 */

export interface ImportContext {
    /** Fases del proyecto y el `orderIndex` con el que empieza cada una. */
    phases: Array<{ id: string; name: string; nextOrderIndex: number }>;
    /** Perfiles que pueden ser responsables de una tarea de este proyecto. */
    members: Array<{ id: string; fullName: string | null; email: string | null }>;
    /** Títulos de las tareas que el proyecto ya tiene. */
    existingTitles: string[];
}

/** Una tarea lista para `ProjectRepository.createTasks`. */
export interface ResolvedTask {
    title: string;
    phaseId: string;
    assignedTo: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    startDate: Date | null;
    dueDate: Date | null;
    description: string | null;
    conclusion: string | null;
    orderIndex: number;
}

export interface ResolveResult {
    tasks: ResolvedTask[];
    /** Impiden importar: el archivo se rechaza entero. */
    issues: TemplateIssue[];
    /** La tarea se creó, pero colocada de otra forma. Se muestran tras importar. */
    warnings: TemplateIssue[];
}

export const IMPORT_MESSAGES = {
    noPhases:
        'El proyecto no tiene ninguna área de trabajo. Créalas antes de importar tareas.',
    unknownPhase: (name: string, available: string[]) =>
        `El proyecto no tiene un área llamada "${name}". Las que hay son: ${available.join(', ')}.`,
    unknownAssignee: (name: string) =>
        `"${name}" no es miembro de este proyecto. Escribe su nombre completo o su email tal y como aparecen en el CRM.`,
    existingTitle: (title: string) =>
        `El proyecto ya tiene una tarea titulada "${title}". Cámbiale el título o bórrala del archivo.`,
} as const;

/**
 * `"2026-08-20"` → medianoche UTC. Sin el sufijo, `new Date` interpreta la cadena como
 * hora local y una zona al oeste de Greenwich la mueve al día anterior.
 */
function toDate(value: string | null): Date | null {
    return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function resolveTemplateTasks(
    parsed: ParsedTemplateTask[],
    context: ImportContext,
): ResolveResult {
    if (context.phases.length === 0) {
        return { tasks: [], issues: [{ line: 1, message: IMPORT_MESSAGES.noPhases }], warnings: [] };
    }

    const phasesByName = new Map(
        context.phases.map((phase) => [normalizeForMatch(phase.name), phase]),
    );
    const membersByName = new Map<string, string>();
    for (const member of context.members) {
        if (member.fullName) membersByName.set(normalizeForMatch(member.fullName), member.id);
        if (member.email) membersByName.set(normalizeForMatch(member.email), member.id);
    }
    const existingTitles = new Set(context.existingTitles.map(normalizeForMatch));

    // El orden se lleva aparte del contexto para no mutar lo que nos han pasado.
    const nextOrderIndex = new Map(
        context.phases.map((phase) => [phase.id, phase.nextOrderIndex]),
    );

    const tasks: ResolvedTask[] = [];
    const issues: TemplateIssue[] = [];
    const warnings: TemplateIssue[] = [];

    for (const task of parsed) {
        const at = (message: string): TemplateIssue => ({
            line: task.line,
            taskTitle: task.title,
            message,
        });

        // La primera fase es el destino de reserva: el orden de `context.phases` es el
        // del proyecto, así que es la que el usuario ve más a la izquierda en el tablero.
        let phase = phasesByName.get(normalizeForMatch(task.phaseName));
        if (!phase) {
            warnings.push(
                at(
                    IMPORT_MESSAGES.unknownPhase(
                        task.phaseName,
                        context.phases.map((p) => p.name),
                    ),
                ),
            );
            phase = context.phases[0];
        }

        let assignedTo: string | null = null;
        if (task.assigneeName) {
            // Coincidencia exacta, no el `includes` de `chat-task`: asignarle a otra
            // persona la tarea equivocada es peor que pedir que se escriba el nombre bien.
            const found = membersByName.get(normalizeForMatch(task.assigneeName));
            if (found) assignedTo = found;
            else warnings.push(at(IMPORT_MESSAGES.unknownAssignee(task.assigneeName)));
        }

        if (existingTitles.has(normalizeForMatch(task.title))) {
            issues.push(at(IMPORT_MESSAGES.existingTitle(task.title)));
            continue;
        }

        const orderIndex = nextOrderIndex.get(phase.id)!;
        nextOrderIndex.set(phase.id, orderIndex + 1);

        tasks.push({
            title: task.title,
            phaseId: phase.id,
            assignedTo,
            status: task.status,
            priority: task.priority,
            startDate: toDate(task.startDate),
            dueDate: toDate(task.dueDate),
            description: task.description,
            conclusion: task.conclusion,
            orderIndex,
        });
    }

    return { tasks, issues, warnings };
}
