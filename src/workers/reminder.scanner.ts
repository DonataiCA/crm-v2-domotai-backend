import { TaskRepository } from '../repositories/task.repository';
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
): Promise<{ reminderSent: number; dueSent: number }> {
    const leadHours = Number(process.env.REMINDER_DUE_LEAD_HOURS) || 24;
    const dueThreshold = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

    let reminderSent = 0;
    let dueSent = 0;

    // 1) Recordatorio explícito (reminderDate)
    const reminderTasks = await TaskRepository.findReminderDue(now);
    for (const task of reminderTasks) {
        try {
            await sendReminder(task, task.dueDate ?? task.reminderDate);
            await TaskRepository.markReminderSent(task.id);
            reminderSent++;
        } catch (error) {
            console.error(`[REMINDERS] reminderDate falló para task ${task.id}:`, error);
        }
    }

    // 2) "Vence pronto" (dueDate dentro de la ventana de anticipación)
    const dueTasks = await TaskRepository.findDueSoon(dueThreshold);
    for (const task of dueTasks) {
        try {
            await sendReminder(task, task.dueDate);
            await TaskRepository.markDueReminderSent(task.id);
            dueSent++;
        } catch (error) {
            console.error(`[REMINDERS] dueDate falló para task ${task.id}:`, error);
        }
    }

    return { reminderSent, dueSent };
}

type ReminderTask = {
    id: string;
    title: string;
    organizationId: string;
    assignedTo: string | null;
    dueDate: Date | null;
    reminderDate: Date | null;
    assignee: { id: string; fullName: string | null; email: string } | null;
    project: { name: string } | null;
};

async function sendReminder(task: ReminderTask, when: Date | null): Promise<void> {
    await notify({
        type: 'TASK_DUE_SOON',
        organizationId: task.organizationId,
        recipientUserId: task.assignedTo ?? undefined,
        title: `Recordatorio: ${task.title}`,
        body: `La tarea "${task.title}" tiene una fecha próxima.`,
        entityType: 'Task',
        entityId: task.id,
        metadata: {
            assigneeName: task.assignee?.fullName ?? 'Team member',
            taskTitle: task.title,
            projectName: task.project?.name ?? '',
            dueDate: when ? new Date(when).toISOString() : '',
        },
    });
}
