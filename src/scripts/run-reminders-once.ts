/**
 * Dispara el barrido de recordatorios UNA vez y sale. Para probar en local sin
 * esperar al intervalo del scheduler:  npm run reminders:once
 */
import 'dotenv/config';
import { scanAndSendReminders } from '../workers/reminder.scanner';

async function main() {
    const result = await scanAndSendReminders();
    console.log('[reminders:once] resultado:', result);
    process.exit(0);
}

main().catch((error) => {
    console.error('[reminders:once] error:', error);
    process.exit(1);
});
