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

