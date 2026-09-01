import { scanAndSendReminders } from './reminder.scanner';
import { pm2Logger } from '../utils/logger';

/**
 * Programa el barrido de recordatorios de tareas con `setInterval` (sin Redis).
 * La idempotencia vive en las columnas `reminderSentAt`/`dueReminderSentAt`, así
 * que aunque corran varias instancias, cada recordatorio se manda una sola vez.
 *
 * Controlado por env:
 *  - REMINDERS_ENABLED=false  → no arranca.
 *  - REMINDER_INTERVAL_MS     → periodo del barrido (default 300000 = 5 min).
 */
export function startReminderScheduler(): void {
    if (process.env.NODE_ENV === 'test' || process.env.REMINDERS_ENABLED === 'false') {
        return;
    }

    const intervalMs = Number(process.env.REMINDER_INTERVAL_MS) || 5 * 60 * 1000;

    const run = async () => {
        try {
            const { reminderSent, dueSent } = await scanAndSendReminders();
            if (reminderSent || dueSent) {
                pm2Logger.info(`[Reminders] enviados: reminderDate=${reminderSent}, dueDate=${dueSent}`);
            }
        } catch (error) {
            pm2Logger.error(`[Reminders] barrido falló: ${String(error)}`);
        }
    };

    // Un primer barrido al arrancar (con margen para que la BD esté lista) y luego periódico.
    setTimeout(run, 10 * 1000);
    setInterval(run, intervalMs);

    pm2Logger.info(`[Reminders] scheduler iniciado (cada ${intervalMs} ms)`);
}
