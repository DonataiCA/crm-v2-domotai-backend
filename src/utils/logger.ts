import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(({ level, message, timestamp }) => {
            return `${timestamp} [${level}] ${message}`;
        })
    ),
    transports: [new transports.Console()],
});

// Custom logger for PM2 format (similar to your example)
export const pm2Logger = {
    info: (message: string) => {
        const timestamp = new Date().toISOString();
        console.log(`${timestamp} [info] ${message}`);
    },
    error: (message: string) => {
        const timestamp = new Date().toISOString();
        console.error(`${timestamp} [error] ${message}`);
    },
    warn: (message: string) => {
        const timestamp = new Date().toISOString();
        console.warn(`${timestamp} [warn] ${message}`);
    }
};

