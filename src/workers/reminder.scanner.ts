import { TaskRepository } from '../repositories/task.repository';
import { ProjectRepository } from '../repositories/project.repository';
import { LeadRepository } from '../repositories/lead.repository';
import { notify } from '../utils/notify';

// Anticipación por tipo (constantes de negocio, no configurables por env).
const HOUR = 60 * 60 * 1000;
// "Vence pronto" de tareas: se avisa 24 h antes del dueDate.
const TASK_DUE_LEAD_MS = 24 * HOUR;
// Vencimiento de proyecto: necesita más margen → 3 días antes del endDate.
const PROJECT_DUE_LEAD_MS = 72 * HOUR;
// reminderDate y nextFollowUp disparan el mismo día (sin anticipación): <= now.

/**
 * Barrido de recordatorios por fecha (tareas, tareas de proyecto, proyectos y
 * seguimiento de leads). Convierte "llegó la fecha" en "enviar correo" vía
 * `notify(...)`, que crea la notificación in-app, respeta las preferencias del
 * usuario y manda el correo con la plantilla correspondiente.
 *
 * Criterio de disparo por tipo:
 *   - Task.reminderDate  → el mismo día (reminderDate <= now)
 *   - Task/ProjectTask.dueDate → 24 h antes (TASK_DUE_LEAD_MS)
 *   - Project.endDate    → 3 días antes (PROJECT_DUE_LEAD_MS)
 *   - Lead.nextFollowUp  → el día del seguimiento (nextFollowUp <= now)
 *
 * Idempotente: sella el marcador correspondiente tras avisar, así que un segundo
 * barrido no reenvía. Función pura (sin timer) para poder testearla.
 */
export async function scanAndSendReminders(
    now: Date = new Date(),
): Promise<{ reminderSent: number; dueSent: number; projectTaskDueSent: number; projectDueSent: number; followUpSent: number }> {
    const taskDueThreshold = new Date(now.getTime() + TASK_DUE_LEAD_MS);
    const projectDueThreshold = new Date(now.getTime() + PROJECT_DUE_LEAD_MS);

    let reminderSent = 0;
    let dueSent = 0;
    let projectTaskDueSent = 0;
    let projectDueSent = 0;
    let followUpSent = 0;

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

    // 2) Tareas de CRM: "vence pronto" (dueDate dentro de la ventana de 24 h)
    const dueTasks = await TaskRepository.findDueSoon(taskDueThreshold);
    for (const task of dueTasks) {
        try {
            await sendTaskReminder(task, task.dueDate, 'TASK_DUE_SOON');
            await TaskRepository.markDueReminderSent(task.id);
            dueSent++;
        } catch (error) {
            console.error(`[REMINDERS] dueDate falló para task ${task.id}:`, error);
        }
    }

    // 3) Tareas de PROYECTO: "vence pronto" (dueDate, 24 h) → al asignado
    const projectTasks = await ProjectRepository.findTasksDueSoon(taskDueThreshold);
    for (const task of projectTasks) {
        try {
            await sendTaskReminder(task, task.dueDate, 'PROJECT_TASK_DUE_SOON');
            await ProjectRepository.markTaskDueReminderSent(task.id);
            projectTaskDueSent++;
        } catch (error) {
            console.error(`[REMINDERS] dueDate falló para projectTask ${task.id}:`, error);
        }
    }

    // 4) PROYECTOS: vencimiento (endDate, 3 días) → al responsable (projectLead)
    const projects = await ProjectRepository.findProjectsDueSoon(projectDueThreshold);
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

    // 5) LEADS: próximo seguimiento (nextFollowUp) → al asignado, el día D
    const followUps = await LeadRepository.findFollowUpDue(now);
    for (const lead of followUps) {
        try {
            await notify({
                type: 'LEAD_FOLLOWUP',
                organizationId: lead.organizationId,
                recipientUserId: lead.assignedTo ?? undefined,
                title: `Seguimiento de lead: ${lead.name ?? ''}`,
                body: `Hoy toca dar seguimiento al lead "${lead.name ?? ''}".`,
                entityType: 'Lead',
                entityId: lead.id,
                metadata: {
                    assigneeName: lead.assignee?.fullName ?? 'Team member',
                    leadName: lead.name ?? '',
                    dueDate: lead.nextFollowUp ? new Date(lead.nextFollowUp).toISOString() : '',
                },
            });
            await LeadRepository.markFollowUpReminderSent(lead.id);
            followUpSent++;
        } catch (error) {
            console.error(`[REMINDERS] nextFollowUp falló para lead ${lead.id}:`, error);
        }
    }

    return { reminderSent, dueSent, projectTaskDueSent, projectDueSent, followUpSent };
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
