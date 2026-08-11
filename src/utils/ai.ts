import OpenAI from 'openai';
import { AppError } from './error';

// El cliente se crea en la primera llamada, no al importar el módulo.
// Desde openai v7 el constructor lanza si falta la API key, y los imports de
// app.ts se ejecutan antes de dotenv.config(), así que construirlo aquí
// tumbaba el servidor entero al arrancar.
let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!client) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new AppError('OPENAI_API_KEY is not configured', 503);
        }
        client = new OpenAI({ apiKey });
    }
    return client;
}

interface GeneratedTask {
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    phaseId: string;
    orderIndex: number;
    estimatedHours?: number;
}

interface ChatTaskResult {
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    phaseId: string | null;
    phaseName: string | null;
    assigneeName: string | null;
    dueDate: string | null;
}

export type ChatAction =
    | {
        action: 'create';
        title: string;
        description: string;
        priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
        phaseId: string | null;
        phaseName: string | null;
        assigneeName: string | null;
        dueDate: string | null;
    }
    | {
        action: 'update';
        taskId: string;
        taskTitle: string; // for echo back
        // Any subset of these may be present
        assigneeName?: string | null;
        priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
        status?: 'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';
        phaseId?: string | null;
        phaseName?: string | null;
        startDate?: string | null;
        dueDate?: string | null;
        title?: string;
        description?: string;
    };

interface ExistingTaskRef {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    phaseName: string | null;
    assigneeName: string | null;
}

/**
 * Generate project tasks from PRD and phases using OpenAI.
 */
export async function generateTasksFromPRD(
    prd: string,
    phases: Array<{ id: string; name: string; description?: string | null }>,
    projectName: string,
    existingTaskTitles: string[] = [],
): Promise<GeneratedTask[]> {
    const phasesDescription = phases
        .map((p) => `- Phase ID: "${p.id}" | Name: "${p.name}" | Description: "${p.description || 'N/A'}"`)
        .join('\n');

    const existingContext = existingTaskTitles.length > 0
        ? `\n\nTareas que YA existen (NO las repitas):\n${existingTaskTitles.map(t => `- ${t}`).join('\n')}`
        : '';

    const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: `Eres un Project Manager experto en desarrollo de software.
Tu trabajo es analizar un PRD (Product Requirements Document) y generar tareas accionables para cada fase del proyecto.

Reglas:
- Genera entre 3 y 8 tareas por fase, según la complejidad
- Cada tarea debe ser específica, accionable y medible
- Las tareas deben estar en español
- Prioridades: URGENT (bloqueantes), HIGH (críticas para el MVP), MEDIUM (importantes), LOW (nice-to-have)
- Ordena las tareas por dependencia lógica (orderIndex)
- NO repitas tareas que ya existen
- La descripción debe incluir criterios de aceptación concretos
- Adapta las tareas al contexto específico del PRD, no uses genéricos

Responde SOLO con un JSON válido con esta estructura:
{
  "tasks": [
    {
      "title": "string",
      "description": "string con criterios de aceptación",
      "priority": "HIGH|MEDIUM|LOW|URGENT",
      "phaseId": "el ID exacto de la fase",
      "orderIndex": 0,
      "estimatedHours": 4
    }
  ]
}`,
            },
            {
                role: 'user',
                content: `Proyecto: ${projectName}

PRD:
${prd}

Fases del proyecto:
${phasesDescription}
${existingContext}

Genera las tareas para TODAS las fases. Asegúrate de que cada tarea tenga el phaseId correcto.`,
            },
        ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content);
    return parsed.tasks || [];
}

/**
 * Legacy compatibility — only emits CREATE actions.
 * Prefer parseChatActions for full create+update support.
 */
export async function parseTasksFromChat(
    message: string,
    phases: Array<{ id: string; name: string }>,
    members: Array<{ id: string; name: string }>,
    projectName: string,
): Promise<ChatTaskResult[]> {
    const actions = await parseChatActions(message, phases, members, [], projectName);
    return actions
        .filter((a): a is Extract<ChatAction, { action: 'create' }> => a.action === 'create')
        .map(a => ({
            title: a.title,
            description: a.description,
            priority: a.priority,
            phaseId: a.phaseId,
            phaseName: a.phaseName,
            assigneeName: a.assigneeName,
            dueDate: a.dueDate,
        }));
}

/**
 * Parse a natural language message into one or more actions:
 * - create: build a brand-new task
 * - update: modify an existing task (assignee, priority, status, phase, due date, title, description)
 *
 * The AI receives the list of existing tasks so it can resolve references like
 * "asigna todas las tareas en TODO a David" into a list of update actions per task.
 */
export async function parseChatActions(
    message: string,
    phases: Array<{ id: string; name: string }>,
    members: Array<{ id: string; name: string }>,
    existingTasks: ExistingTaskRef[],
    projectName: string,
): Promise<ChatAction[]> {
    const phasesStr = phases.map((p) => `"${p.name}" (ID: ${p.id})`).join(', ');
    const membersStr = members.map((m) => `"${m.name}" (ID: ${m.id})`).join(', ');

    // Cap the existing-tasks context to keep prompts small. Send up to 80 tasks,
    // open ones first.
    const cappedTasks = [...existingTasks]
        .sort((a, b) => {
            const aOpen = a.status !== 'COMPLETED' ? 0 : 1;
            const bOpen = b.status !== 'COMPLETED' ? 0 : 1;
            return aOpen - bOpen;
        })
        .slice(0, 80);

    const tasksStr = cappedTasks.length === 0
        ? '(ninguna)'
        : cappedTasks.map(t =>
            `- ID: ${t.id} | Título: "${t.title}" | Estado: ${t.status} | Prioridad: ${t.priority || 'MEDIUM'} | Fase: ${t.phaseName || 'sin fase'} | Asignado: ${t.assigneeName || 'sin asignar'}`
        ).join('\n');

    // Provide deterministic date references the model can reuse without doing arithmetic itself
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };
    const dateRefs = [
        `hoy = ${fmt(today)}`,
        `+3 días = ${addDays(3)}`,
        `+1 semana = ${addDays(7)}`,
        `+2 semanas = ${addDays(14)}`,
        `+3 semanas = ${addDays(21)}`,
        `+1 mes = ${addDays(30)}`,
        `+6 semanas = ${addDays(42)}`,
        `+2 meses = ${addDays(60)}`,
        `+3 meses = ${addDays(90)}`,
    ].join(' | ');

    const response = await getOpenAI().chat.completions.create({
        // gpt-4o is noticeably better at multi-step counting/arithmetic which matters
        // for date distribution across N tasks. Cost is small for a per-prompt call.
        model: 'gpt-4o',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 4000,
        messages: [
            {
                role: 'system',
                content: `Eres un asistente que interpreta peticiones en lenguaje natural sobre tareas de un proyecto y las convierte en ACCIONES ejecutables.

Hay dos tipos de acciones posibles:
1. "create" — crear una tarea NUEVA
2. "update" — modificar una tarea EXISTENTE (asignar, cambiar prioridad, estado, fase, fecha límite o título)

REGLAS CRÍTICAS:
- Si el usuario describe una nueva tarea ("crear", "agregar", "necesito una tarea para…"), usa "create".
- Si el usuario referencia una tarea EXISTENTE (por título o por filtro tipo "todas las tareas en TODO", "las tareas asignadas a X", "la tarea de…"), usa "update".
- Cuando el usuario pide algo masivo ("asigna TODAS las tareas en TODO a David", "distribuye fechas para todas las tareas pendientes"), genera UNA acción "update" por CADA tarea que coincida con el filtro. Usa la lista de tareas existentes para identificar cuáles aplican.
- Si una petición es ambigua y no puedes identificar la tarea con confianza, NO inventes — devuelve un array vacío y el usuario reformulará.
- En "update" SIEMPRE incluye taskId (el ID exacto de la lista) y taskTitle. Solo incluye los campos que cambian.
- No generes acciones de borrar tareas (no hay action "delete").

DISTRIBUCIÓN DE FECHAS (inicio + fin) — IMPORTANTE:
- Si el usuario pide distribuir/repartir/programar tiempos o fechas para tener todo listo en una ventana ("distribuye los tiempos de las tareas en TODO para terminar en 1 mes", "ponle deadlines para acabar antes del viernes", "arma el cronograma"), sigue este procedimiento EXACTO:

  1. Cuenta N = número de tareas que aplican (ej. todas en estado TODO).
  2. Calcula D = días totales en la ventana (ej. "1 mes" = 30, "2 semanas" = 14).
  3. Calcula W = duración de cada tarea = D / N (redondea a entero, mínimo 1 día).
  4. Para la tarea i (i = 1..N):
     - startDate = hoy + (i − 1) × W días
     - dueDate   = hoy + i × W días
     - La última (i = N) cierra exactamente en hoy + D.
  5. CRÍTICO: cada tarea DEBE tener un slot ÚNICO. PROHIBIDO repetir el mismo par (startDate, dueDate) en dos tareas. Si tienes 10 tareas, debes emitir 10 pares DISTINTOS.
  6. Si el cálculo da fechas que no están en la tabla de referencias, calcula contando días manualmente (ej. hoy + 9 días = ${addDays(9)}, hoy + 12 días = ${addDays(12)}, hoy + 18 días = ${addDays(18)}, hoy + 24 días = ${addDays(24)}).

  Ejemplo concreto con 10 tareas en 30 días → W = 3:
  - T1: ${fmt(today)} → ${addDays(3)}
  - T2: ${addDays(3)} → ${addDays(6)}
  - T3: ${addDays(6)} → ${addDays(9)}
  - T4: ${addDays(9)} → ${addDays(12)}
  - T5: ${addDays(12)} → ${addDays(15)}
  - T6: ${addDays(15)} → ${addDays(18)}
  - T7: ${addDays(18)} → ${addDays(21)}
  - T8: ${addDays(21)} → ${addDays(24)}
  - T9: ${addDays(24)} → ${addDays(27)}
  - T10: ${addDays(27)} → ${addDays(30)}

  Ejemplo con 5 tareas en 30 días → W = 6:
  - T1: ${fmt(today)} → ${addDays(6)}, T2: ${addDays(6)} → ${addDays(12)}, T3: ${addDays(12)} → ${addDays(18)}, T4: ${addDays(18)} → ${addDays(24)}, T5: ${addDays(24)} → ${addDays(30)}

- SIEMPRE emite AMBOS campos en cada update: startDate y dueDate. Sin startDate el Gantt no muestra duración.
- Si el usuario pide trabajo EN PARALELO (palabra "paralelo" explícita), todas las tareas pueden empezar hoy y terminar en la fecha objetivo — pero SIEMPRE emite startDate + dueDate.
- Para cambiar UNA tarea puntual ("la tarea X para el viernes"), también incluye startDate (hoy) si la tarea no tenía fecha previa.

Contexto del proyecto:
- Proyecto: "${projectName}"
- Fases disponibles: [${phasesStr}]
- Miembros del equipo: [${membersStr}]
- Hoy: ${fmt(today)}

Referencias de fechas (úsalas siempre que sea posible para evitar errores de cálculo):
${dateRefs}

Tareas existentes en este proyecto:
${tasksStr}

Para CREATE incluye: title, description, priority (LOW|MEDIUM|HIGH|URGENT, default MEDIUM), phaseId (o null), phaseName (o null), assigneeName (o null), dueDate (ISO YYYY-MM-DD o null).

Para UPDATE incluye: taskId (obligatorio), taskTitle (obligatorio), y SOLO los campos que cambian: assigneeName, priority, status (TODO|IN_PROGRESS|ON_HOLD|COMPLETED), phaseId, phaseName, startDate (ISO YYYY-MM-DD), dueDate (ISO YYYY-MM-DD), title, description.

Responde SOLO con JSON:
{
  "actions": [
    { "action": "create", "title": "...", "description": "...", "priority": "MEDIUM", "phaseId": null, "phaseName": null, "assigneeName": null, "dueDate": null },
    { "action": "update", "taskId": "...", "taskTitle": "...", "assigneeName": "David Altuve" }
  ]
}`,
            },
            {
                role: 'user',
                content: message,
            },
        ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from AI');

    const parsed = JSON.parse(content);
    const raw = parsed.actions || parsed.tasks || [];

    // Defensive normalization: ensure every entry has an action field.
    return (raw as any[])
        .map((a: any) => {
            if (!a || typeof a !== 'object') return null;
            // Backward compat: if no action and looks like a create payload
            if (!a.action && a.title) {
                return { action: 'create', ...a };
            }
            return a;
        })
        .filter((a): a is ChatAction => a && (a.action === 'create' || a.action === 'update'));
}
