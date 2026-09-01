import { TaskRepository } from '../repositories/task.repository';
import { ProjectRepository } from '../repositories/project.repository';
import { notify } from '../utils/notify';

/**
 * Barrido de recordatorios de tareas por fecha.
 *
 * Convierte "llegó la fecha" en "enviar correo": recorre las tareas cuyo
 * `reminderDate` ya venció (y no se avisó) y las que entran en la ventana
 * "vence pronto" por `dueDate`, y por cada una emite `notify({ type:
 * 'TASK_DUE_SOON' })` — que crea la notificación in-app, respeta las
 * preferencias del usuario y manda el correo con `sendTaskReminder`.
 *
 * Idempotente: sella `reminderSentAt` / `dueReminderSentAt` tras avisar, así que
 * un segundo barrido no reenvía. Función pura (sin timer) para poder testearla.
 */
export async function scanAndSendReminders(
    now: Date = new Date(),
): Promise<{ reminderSent: number; dueSent: number; projectTaskDueSent: number; projectDueSent: number }> {
    const leadHours = Number(process.env.REMINDER_DUE_LEAD_HOURS) || 24;
    const dueThreshold = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

    let reminderSent = 0;
    let dueSent = 0;
    let projectTaskDueSent = 0;
    let projectDueSent = 0;

    // 1) Tareas de CRM: recordatorio explícito (reminderDate)
    const reminderTasks = await TaskRepository.findReminderDue(now);
    for (const task of reminderTasks) {
        try {
            await sendTaskReminder(task, task.dueDate ?? task.reminderDate, 'TASK_DUE_SOON');
            await TaskRepository.markReminderSent(task.id);
            reminderSent++;
        } catch (error) {
            console.error(`[REMINDERS] reminderDate falló para task ${task.id}:`, error);
        }
    }

    // 2) Tareas de CRM: "vence pronto" (dueDate dentro de la ventana)
    const dueTasks = await TaskRepository.findDueSoon(dueThreshold);
    for (const task of dueTasks) {
        try {
            await sendTaskReminder(task, task.dueDate, 'TASK_DUE_SOON');
            await TaskRepository.markDueReminderSent(task.id);
            dueSent++;
        } catch (error) {
            console.error(`[REMINDERS] dueDate falló para task ${task.id}:`, error);
        }
    }

    // 3) Tareas de PROYECTO: "vence pronto" (dueDate) → al asignado
    const projectTasks = await ProjectRepository.findTasksDueSoon(dueThreshold);
    for (const task of projectTasks) {
        try {
            await sendTaskReminder(task, task.dueDate, 'PROJECT_TASK_DUE_SOON');
            await ProjectRepository.markTaskDueReminderSent(task.id);
            projectTaskDueSent++;
        } catch (error) {
            console.error(`[REMINDERS] dueDate falló para projectTask ${task.id}:`, error);
        }
    }

    // 4) PROYECTOS: vencimiento (endDate) → al responsable (projectLead)
    const projects = await ProjectRepository.findProjectsDueSoon(dueThreshold);
    for (const project of projects) {
        try {
            await notify({
                type: 'PROJECT_DUE',
                organizationId: project.organizationId,
                recipientUserId: project.projectLeadId ?? undefined,
                title: `Vencimiento de proyecto: ${project.name}`,
                body: `El proyecto "${project.name}" tiene una fecha de fin próxima.`,
                entityType: 'Project',
                entityId: project.id,
                metadata: {
                    leadName: project.projectLead?.fullName ?? 'Team member',
                    projectName: project.name,
                    dueDate: project.endDate ? new Date(project.endDate).toISOString() : '',
                },
            });
            await ProjectRepository.markProjectDueReminderSent(project.id);
            projectDueSent++;
        } catch (error) {
            console.error(`[REMINDERS] endDate falló para project ${project.id}:`, error);
        }
    }

    return { reminderSent, dueSent, projectTaskDueSent, projectDueSent };
}

type ReminderTask = {
    id: string;
    title: string;
    organizationId: string;
    assignedTo: string | null;
    dueDate: Date | null;
    reminderDate?: Date | null;
    assignee: { id: string; fullName: string | null; email: string } | null;
    project: { name: string } | null;
};

// Task y ProjectTask comparten la plantilla `sendTaskReminder`; sólo cambia el
// `type` (para que el opt-out por preferencia sea independiente por entidad).
async function sendTaskReminder(
    task: ReminderTask,
    when: Date | null,
    type: 'TASK_DUE_SOON' | 'PROJECT_TASK_DUE_SOON',
): Promise<void> {
    await notify({
        type,
        organizationId: task.organizationId,
        recipientUserId: task.assignedTo ?? undefined,
        title: `Recordatorio: ${task.title}`,
        body: `La tarea "${task.title}" tiene una fecha próxima.`,
        entityType: type === 'PROJECT_TASK_DUE_SOON' ? 'ProjectTask' : 'Task',
        entityId: task.id,
        metadata: {
            assigneeName: task.assignee?.fullName ?? 'Team member',
            taskTitle: task.title,
            projectName: task.project?.name ?? '',
            dueDate: when ? new Date(when).toISOString() : '',
        },
    });
}
