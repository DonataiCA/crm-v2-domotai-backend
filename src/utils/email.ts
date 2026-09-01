import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.spacemail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const FROM = process.env.SMTP_FROM || '"Domotai" <notification@domotai.online>';

// ─── Domotai Brand Colors ───────────────────────────────────────────────────
const BLUE = '#4A89B9';
const ORANGE = '#FF5F00';
const DARK = '#1e293b';
const GRAY_TEXT = '#475569';
const LIGHT_BG = '#f8fafc';
const CARD_BG = '#ffffff';

// ─── Base HTML template with Domotai branding ───────────────────────────────

function wrapHtml(title: string, body: string): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${LIGHT_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${LIGHT_BG};padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">

  <!-- Header with logo -->
  <tr><td style="background:${DARK};padding:28px 32px;text-align:center;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="center">
        <div style="display:inline-block;">
          <span style="color:${BLUE};font-size:28px;font-weight:800;letter-spacing:1px;">DOMOT</span><span style="color:${ORANGE};font-size:28px;font-weight:800;letter-spacing:1px;">AI</span>
        </div>
        <p style="color:#94a3b8;font-size:12px;margin:6px 0 0;letter-spacing:2px;text-transform:uppercase;">Technologies</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- Title bar -->
  <tr><td style="background:${BLUE};padding:16px 32px;">
    <h2 style="color:#ffffff;margin:0;font-size:16px;font-weight:600;text-align:center;">${title}</h2>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px;">
    ${body}
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:${LIGHT_BG};padding:20px 32px;border-top:1px solid #e2e8f0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="center">
        <p style="color:#94a3b8;font-size:11px;margin:0;">Powered by <strong style="color:${BLUE};">Domotai Technologies</strong></p>
        <p style="color:#cbd5e1;font-size:10px;margin:4px 0 0;">This is an automated notification. Please do not reply to this email.</p>
      </td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(text: string, url: string, color: string = ORANGE): string {
    return `<div style="text-align:center;margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:0.5px;">${text}</a>
    </div>`;
}

function credentialsBox(email: string, password: string): string {
    return `<div style="background:#f1f5f9;border-radius:10px;padding:20px 24px;margin:20px 0;border:1px solid #e2e8f0;">
      <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Your Login Credentials</p>
      <table cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr>
        <td style="padding:4px 0;color:${GRAY_TEXT};font-size:14px;width:100px;font-weight:600;">Email:</td>
        <td style="padding:4px 0;color:${DARK};font-size:14px;font-family:monospace;">${email}</td>
      </tr><tr>
        <td style="padding:4px 0;color:${GRAY_TEXT};font-size:14px;font-weight:600;">Password:</td>
        <td style="padding:4px 0;color:${DARK};font-size:14px;font-family:monospace;background:#fef3c7;padding:2px 8px;border-radius:4px;">${password}</td>
      </tr></table>
    </div>`;
}

function infoBox(content: string, borderColor: string = BLUE): string {
    return `<div style="background:#f1f5f9;border-radius:10px;padding:20px 24px;margin:20px 0;border-left:4px solid ${borderColor};">
      ${content}
    </div>`;
}

// ─── Retry wrapper with exponential backoff ────────────────────────────────

async function sendWithRetry(mailOptions: any, retries = 3): Promise<boolean> {
    const delays = [1000, 5000, 15000];
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            await transporter.sendMail(mailOptions);
            return true;
        } catch (error) {
            console.error(`[EMAIL] Attempt ${attempt + 1}/${retries} failed:`, (error as Error).message);
            if (attempt < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            } else {
                console.error('[EMAIL] All retry attempts exhausted for:', mailOptions.to, mailOptions.subject);
                return false;
            }
        }
    }
    return false;
}

// ─── Send email ─────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const success = await sendWithRetry({ from: FROM, to, subject, html });
    if (success) {
        console.log(`✉️  Email sent to ${to}: ${subject}`);
    } else {
        console.error(`❌ Failed to send email to ${to}: ${subject}`);
    }
    return success;
}

// ─── Email Templates ────────────────────────────────────────────────────────

export const emailService = {
    /**
     * Send project invitation to a client.
     */
    sendClientInvitation: async (
        to: string,
        clientName: string,
        projectName: string,
        organizationName: string,
        shareUrl: string,
        permissions: string[],
    ) => {
        const permLabels: Record<string, string> = {
            view: 'View project progress',
            comment: 'Comment on tasks',
            create_task: 'Create new tasks',
            edit_task: 'Edit task status',
        };
        const permList = permissions
            .map(p => permLabels[p] || p)
            .map(p => `<li style="color:${GRAY_TEXT};font-size:14px;padding:2px 0;">${p}</li>`)
            .join('');

        const html = wrapHtml(
            'Project Invitation',
            `<p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Hi <strong style="color:${DARK};">${clientName}</strong>,
            </p>
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              You have been invited by <strong style="color:${DARK};">${organizationName}</strong> to collaborate on:
            </p>
            ${infoBox(`<p style="margin:0;color:${DARK};font-size:18px;font-weight:700;">${projectName}</p>`, ORANGE)}
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:14px;font-weight:600;">What you can do:</p>
            <ul style="margin:0 0 16px;padding-left:20px;">${permList}</ul>
            ${button('View project', shareUrl)}
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:13px;margin-top:8px;">
              This is your private access link — no account or password required. Keep it to yourself.
            </p>`,
        );
        return sendEmail(to, `You're invited to "${projectName}" — ${organizationName}`, html);
    },

    /**
     * Send task assignment notification.
     */
    sendTaskAssigned: async (
        to: string,
        assigneeName: string,
        taskTitle: string,
        projectName: string,
        dueDate: string | null,
        assignedBy: string,
        actionUrl?: string,
    ) => {
        const dueLine = dueDate
            ? `<p style="margin:6px 0 0;color:${GRAY_TEXT};font-size:14px;">
                <strong>Due:</strong> ${new Date(dueDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>`
            : '';
        const html = wrapHtml(
            'New Task Assigned',
            `<p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Hi <strong style="color:${DARK};">${assigneeName}</strong>,
            </p>
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              <strong>${assignedBy}</strong> assigned you a new task${projectName ? ` in <strong>"${projectName}"</strong>` : ''}:
            </p>
            ${infoBox(`
              <p style="margin:0;color:${DARK};font-size:16px;font-weight:700;">${taskTitle}</p>
              ${dueLine}
            `)}
            ${actionUrl ? button('View Task', actionUrl, BLUE) : ''}`,
        );
        return sendEmail(to, `Task assigned: ${taskTitle}`, html);
    },

    /**
     * Send task reminder.
     */
    sendTaskReminder: async (
        to: string,
        assigneeName: string,
        taskTitle: string,
        projectName: string,
        dueDate: string,
    ) => {
        const html = wrapHtml(
            'Task Reminder',
            `<p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Hi <strong style="color:${DARK};">${assigneeName}</strong>,
            </p>
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              This is a friendly reminder about an upcoming deadline:
            </p>
            ${infoBox(`
              <p style="margin:0;color:${DARK};font-size:16px;font-weight:700;">${taskTitle}</p>
              <p style="margin:6px 0 0;color:#92400e;font-size:14px;font-weight:600;">
                Due: ${new Date(dueDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p style="margin:4px 0 0;color:${GRAY_TEXT};font-size:13px;">Project: ${projectName}</p>
            `, '#f59e0b')}`,
        );
        return sendEmail(to, `Reminder: ${taskTitle} is due soon`, html);
    },

    /**
     * Recordatorio de vencimiento de un proyecto, al responsable del proyecto.
     */
    sendProjectDeadline: async (
        to: string,
        leadName: string,
        projectName: string,
        endDate: string,
    ) => {
        const html = wrapHtml(
            'Project Deadline',
            `<p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Hi <strong style="color:${DARK};">${leadName}</strong>,
            </p>
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              This is a friendly reminder about an upcoming project deadline:
            </p>
            ${infoBox(`
              <p style="margin:0;color:${DARK};font-size:16px;font-weight:700;">${projectName}</p>
              <p style="margin:6px 0 0;color:#92400e;font-size:14px;font-weight:600;">
                Due: ${new Date(endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            `, '#f59e0b')}`,
        );
        return sendEmail(to, `Reminder: project ${projectName} is due soon`, html);
    },

    /**
     * Send new comment notification.
     */
    sendNewComment: async (
        to: string,
        recipientName: string,
        commenterName: string,
        taskTitle: string,
        commentContent: string,
        projectName: string,
        actionUrl?: string,
    ) => {
        const html = wrapHtml(
            'New Comment',
            `<p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Hi <strong style="color:${DARK};">${recipientName}</strong>,
            </p>
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              <strong>${commenterName}</strong> commented on <strong>"${taskTitle}"</strong>${projectName ? ` in <strong>"${projectName}"</strong>` : ''}:
            </p>
            ${infoBox(`
              <p style="margin:0;color:${DARK};font-size:14px;font-style:italic;line-height:1.6;">"${commentContent}"</p>
            `)}
            ${actionUrl ? button('View Conversation', actionUrl, BLUE) : ''}`,
        );
        return sendEmail(to, `New comment on "${taskTitle}"`, html);
    },

    /**
     * Send lead assigned notification.
     */
    sendLeadAssigned: async (
        to: string, assigneeName: string, leadName: string, assignedBy: string, actionUrl?: string
    ) => {
        const html = wrapHtml(
            'Lead Assigned',
            `<p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Hi <strong style="color:${DARK};">${assigneeName}</strong>,
            </p>
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              You have been assigned a new lead:
            </p>
            ${infoBox(`
              <p style="margin:0;font-size:18px;font-weight:600;color:${DARK};">${leadName}</p>
            `)}
            <p style="color:${GRAY_TEXT};font-size:13px;">Assigned by ${assignedBy}</p>
            ${actionUrl ? button('View Lead', actionUrl, BLUE) : ''}`,
        );
        return sendEmail(to, `Lead assigned: ${leadName}`, html);
    },

    /**
     * Send lead stage change notification.
     */
    sendLeadStageChange: async (
        to: string, assigneeName: string, leadName: string, oldStage: string, newStage: string, actionUrl?: string
    ) => {
        const html = wrapHtml(
            'Lead Stage Updated',
            `<p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Hi <strong style="color:${DARK};">${assigneeName}</strong>,
            </p>
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              A lead you manage has moved stages:
            </p>
            ${infoBox(`
              <p style="margin:0;font-size:18px;font-weight:600;color:${DARK};">${leadName}</p>
              <p style="margin:8px 0 0;color:${GRAY_TEXT};font-size:14px;">
                <span style="text-decoration:line-through;">${oldStage}</span>
                &nbsp;&rarr;&nbsp;
                <strong style="color:${BLUE};">${newStage}</strong>
              </p>
            `)}
            ${actionUrl ? button('View Lead', actionUrl, BLUE) : ''}`,
        );
        return sendEmail(to, `Lead moved to ${newStage}: ${leadName}`, html);
    },

    /**
     * Send organization invitation.
     */
    sendOrgInvitation: async (
        to: string,
        inviteeName: string,
        organizationName: string,
        invitedBy: string,
        loginUrl: string,
        tempPassword: string,
    ) => {
        const html = wrapHtml(
            'Team Invitation',
            `<p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Hi <strong style="color:${DARK};">${inviteeName}</strong>,
            </p>
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              <strong>${invitedBy}</strong> has invited you to join <strong>"${organizationName}"</strong> on Domotai.
            </p>
            ${credentialsBox(to, tempPassword)}
            ${button('Join Team', loginUrl)}
            <div style="background:#fef3c7;border-radius:8px;padding:12px 16px;margin-top:8px;">
              <p style="color:#92400e;font-size:13px;margin:0;">
                <strong>Important:</strong> You will be asked to change your password on your first login.
              </p>
            </div>`,
        );
        return sendEmail(to, `Welcome to ${organizationName} — Domotai`, html);
    },

    /**
     * Send password changed confirmation.
     */
    sendPasswordChanged: async (to: string, userName: string) => {
        const html = wrapHtml(
            'Password Updated',
            `<p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Hi <strong style="color:${DARK};">${userName}</strong>,
            </p>
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Your password has been successfully changed.
            </p>
            <div style="background:#f0fdf4;border-radius:8px;padding:12px 16px;margin:20px 0;border-left:4px solid #22c55e;">
              <p style="color:#166534;font-size:13px;margin:0;">
                If you did not make this change, please contact your administrator immediately.
              </p>
            </div>`,
        );
        return sendEmail(to, 'Password changed successfully — Domotai', html);
    },

    /**
     * Send invoice by email with PDF attachment.
     */
    sendInvoice: async (
        to: string, clientName: string, invoiceNumber: string,
        total: number, currency: string, dueDate: string | null,
        orgName: string, pdfBuffer: Buffer
    ): Promise<boolean> => {
        const dueLine = dueDate
            ? `<p style="color:${GRAY_TEXT};font-size:14px;">Payment is due by <strong>${new Date(dueDate).toLocaleDateString()}</strong>.</p>`
            : '';

        const html = wrapHtml('Invoice', `
            <h2 style="color:${DARK};margin:0 0 8px;">Invoice #${invoiceNumber}</h2>
            <p style="color:${GRAY_TEXT};font-size:15px;">Hello ${clientName},</p>
            <p style="color:${GRAY_TEXT};font-size:14px;">Please find attached your invoice from <strong>${orgName}</strong>.</p>
            <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
                <div style="font-size:32px;font-weight:700;color:${DARK};">${total.toFixed(2)} ${currency}</div>
                <div style="font-size:13px;color:${GRAY_TEXT};margin-top:4px;">Total Amount Due</div>
            </div>
            ${dueLine}
            <p style="color:${GRAY_TEXT};font-size:13px;">The PDF invoice is attached to this email.</p>
        `);

        return sendWithRetry({
            from: FROM,
            to,
            subject: `Invoice #${invoiceNumber} from ${orgName}`,
            html,
            attachments: [{
                filename: `invoice-${invoiceNumber}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
            }],
        });
    },

    /**
     * Send weekly pipeline digest.
     */
    sendWeeklyDigest: async (
        to: string,
        data: { orgName: string; newLeads: number; wonCount: number; wonValue: number; lostLeads: number; overdueTasks: number; topLeadRows: string }
    ): Promise<boolean> => {
        const html = wrapHtml('Weekly Pipeline Digest', `
            <p style="color:${GRAY_TEXT};line-height:1.7;font-size:15px;">
              Weekly summary for <strong style="color:${DARK};">${data.orgName}</strong>
            </p>
            <div style="display:flex;gap:12px;margin:20px 0;">
              ${[
                { label: 'New Leads', value: data.newLeads, color: BLUE },
                { label: 'Won', value: `${data.wonCount} ($${data.wonValue.toLocaleString()})`, color: '#10b981' },
                { label: 'Lost', value: data.lostLeads, color: '#ef4444' },
                { label: 'Overdue Tasks', value: data.overdueTasks, color: ORANGE },
              ].map(kpi => `
                <div style="flex:1;background:${LIGHT_BG};border-radius:8px;padding:16px;text-align:center;border:1px solid #e2e8f0;">
                  <p style="font-size:24px;font-weight:700;color:${kpi.color};margin:0;">${kpi.value}</p>
                  <p style="font-size:12px;color:${GRAY_TEXT};margin:4px 0 0;">${kpi.label}</p>
                </div>
              `).join('')}
            </div>
            ${data.topLeadRows ? `
            <p style="color:${DARK};font-size:14px;font-weight:600;margin:24px 0 8px;">Top 5 Active Leads</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
              <tr style="background:${LIGHT_BG};">
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:${GRAY_TEXT};font-weight:600;">Name</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:${GRAY_TEXT};font-weight:600;">Stage</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:${GRAY_TEXT};font-weight:600;">Amount</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:${GRAY_TEXT};font-weight:600;">Company</th>
              </tr>
              ${data.topLeadRows}
            </table>` : ''}
        `);
        return sendEmail(to, `Weekly Digest — ${data.orgName}`, html);
    },

    /**
     * Verify SMTP connection.
     */
    verify: async (): Promise<boolean> => {
        try {
            await transporter.verify();
            console.log('✅ SMTP connection verified');
            return true;
        } catch (error) {
            console.error('❌ SMTP verification failed:', error);
            return false;
        }
    },
};
