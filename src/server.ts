// Primero que nada: config/queue.ts y utils/email.ts leen process.env al importarse,
// antes de que corra el dotenv.config() de app.ts. En prod PM2 inyecta el .env y no
// se nota; en local sin esto Redis y SMTP ignoran el .env. No pisa variables ya definidas.
import 'dotenv/config';
import app from './app';
import { pm2Logger } from './utils/logger';
import { startQueueProcessor } from './workers/queue.processor';
import { startReminderScheduler } from './workers/reminder.scheduler';
import { emailService } from './utils/email';

const PORT = process.env.PORT || 3000;

startQueueProcessor();
startReminderScheduler();

app.listen(PORT, () => {
    pm2Logger.info(`Server running on http://localhost:${PORT}`);
    emailService.verify();
});

