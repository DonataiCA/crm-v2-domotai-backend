import { Response } from 'express';
import { logger } from './logger';

export class AppError extends Error {
    public statusCode: number;

    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'AppError';
    }
}

/**
 * Envía una respuesta de error y lo imprime en consola.
 * @param res Express Response
 * @param status Código de estado HTTP
 * @param message Mensaje de error para el cliente
 * @param errorInfo (opcional) Detalles adicionales para loggear
 */
export function sendError(res: Response, status: number, message: string, errorInfo?: unknown) {
    // ANSI escape code para rojo intenso
    const red = '\x1b[31m';
    const reset = '\x1b[0m';
    const prefix = `[ERROR][${status}]`;
    if (errorInfo) {
        // Error objects don't serialize with JSON.stringify — extract useful fields
        let info: string;
        if (errorInfo instanceof Error) {
            info = `${errorInfo.name}: ${errorInfo.message}${errorInfo.stack ? '\n  Stack: ' + errorInfo.stack : ''}`;
        } else {
            try {
                info = JSON.stringify(errorInfo, null, 2);
            } catch {
                info = String(errorInfo);
            }
        }
        logger.error(`${red}${prefix}\n  Mensaje: ${message}\n  Info: ${info}${reset}`);
    } else {
        logger.error(`${red}${prefix}\n  Mensaje: ${message}${reset}`);
    }
    return res.status(status).json({ error: message, statusCode: status });
}

