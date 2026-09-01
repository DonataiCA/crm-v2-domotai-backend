import { NotificationRepository } from '../repositories/notification.repository';
import { emailService } from './email';
import { prisma } from '../config/prisma';

interface NotifyParams {
    organizationId: string;
    type: string;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
    actorId?: string;
    recipientUserId?: string;
    recipientEmail?: string;
    metadata?: Record<string, unknown>;
}

export async function notify(params: NotifyParams): Promise<void> {
    try {
        // Always create in-app notification
        await NotificationRepository.create({
            organizationId: params.organizationId,
            type: params.type,
            title: params.title,
            body: params.body,
            entityType: params.entityType,
            entityId: params.entityId,
            actorId: params.actorId,
            metadata: params.metadata,
        });

        // Check notification preferences before sending email
        let recipientUserId = params.recipientUserId;
        let recipientEmail = params.recipientEmail;

        if (!recipientEmail && recipientUserId) {
            const profile = await prisma.profile.findUnique({
                where: { id: recipientUserId },
                select: { email: true, fullName: true, userId: true },
            });
            if (profile?.email) {
                recipientEmail = profile.email;
                recipientUserId = profile.userId || recipientUserId;
            }
        }

        if (recipientEmail && params.type) {
            // Check if user has disabled this notification type
            if (recipientUserId) {
                const pref = await prisma.notificationPreference.findFirst({
                    where: { userId: recipientUserId, notificationType: params.type, channel: 'EMAIL' },
                });
                if (pref && !pref.enabled) {
                    return; // User opted out of this email type
                }
            }
            await sendEmailForType({ ...params, recipientEmail });
        }
    } catch (error) {
        console.error('[NOTIFY] Failed to send notification:', error);
    }
}

function buildActionUrl(type: string, meta: Record<string, unknown>, entityId?: string): string | undefined {
    const base = process.env.FRONTEND_URL?.replace(/\/$/, '');
    if (!base) return undefined;

    const projectId = meta.projectId as string | undefined;
    const taskId = (meta.taskId as string | undefined) || entityId;
    const leadId = (meta.leadId as string | undefined) || entityId;

    switch (type) {
        case 'PROJECT_TASK_ASSIGNED':
            if (projectId) {
                return taskId
                    ? `${base}/projects/${projectId}/tracking?taskId=${taskId}`
                    : `${base}/projects/${projectId}/tracking`;
            }
            return undefined;
        case 'TASK_COMMENT':
            // Comment can be on a project task (has projectId) or a general task
            if (projectId) {
                return `${base}/projects/${projectId}/tracking?taskId=${taskId}`;
            }
            return taskId ? `${base}/tasks?taskId=${taskId}` : `${base}/tasks`;
        case 'TASK_ASSIGNED':
            return taskId ? `${base}/tasks?taskId=${taskId}` : `${base}/tasks`;
        case 'LEAD_ASSIGNED':
        case 'LEAD_STAGE_CHANGE':
            return leadId ? `${base}/leads/${leadId}` : `${base}/leads`;
        default:
            return undefined;
    }
}

async function sendEmailForType(params: NotifyParams & { recipientEmail?: string }): Promise<void> {
    if (!params.recipientEmail) return;
    const meta = params.metadata || {};
    const actionUrl = buildActionUrl(params.type, meta, params.entityId);

    switch (params.type) {
        case 'TASK_ASSIGNED':
        case 'PROJECT_TASK_ASSIGNED':
            await emailService.sendTaskAssigned(
                params.recipientEmail,
                (meta.assigneeName as string) || 'Team member',
                (meta.taskTitle as string) || params.title,
                (meta.projectName as string) || '',
                (meta.dueDate as string) || '',
                (meta.assignedBy as string) || '',
                actionUrl
            );
            break;
        case 'TASK_COMMENT':
            await emailService.sendNewComment(
                params.recipientEmail,
                (meta.recipientName as string) || 'Team member',
                (meta.commenterName as string) || 'Someone',
                (meta.taskTitle as string) || '',
                (meta.commentContent as string) || params.body || '',
                (meta.projectName as string) || '',
                actionUrl
            );
            break;
        case 'TASK_DUE_SOON':
        case 'PROJECT_TASK_DUE_SOON':
            await emailService.sendTaskReminder(
                params.recipientEmail,
                (meta.assigneeName as string) || 'Team member',
                (meta.taskTitle as string) || params.title,
                (meta.projectName as string) || '',
                (meta.dueDate as string) || ''
            );
            break;
        case 'PROJECT_DUE':
            await emailService.sendProjectDeadline(
                params.recipientEmail,
                (meta.leadName as string) || 'Team member',
                (meta.projectName as string) || params.title,
                (meta.dueDate as string) || ''
            );
            break;
        case 'LEAD_ASSIGNED':
            await emailService.sendLeadAssigned(
                params.recipientEmail,
                (meta.assigneeName as string) || 'Team member',
                (meta.leadName as string) || params.title,
                (meta.assignedBy as string) || 'Someone',
                actionUrl
            );
            break;
        case 'LEAD_STAGE_CHANGE':
            await emailService.sendLeadStageChange(
                params.recipientEmail,
                (meta.assigneeName as string) || 'Team member',
                (meta.leadName as string) || params.title,
                (meta.oldStage as string) || '',
                (meta.newStage as string) || '',
                actionUrl
            );
            break;
        default:
            break;
    }
}
