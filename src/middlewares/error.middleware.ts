import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { AppError } from '../utils/error';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
    // Zod validation errors
    if (err instanceof ZodError) {
        const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        return res.status(400).json({ error: 'Validation failed', details: messages });
    }

    // App-specific errors with status codes
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    // Log unexpected errors
    logger.error(`[${req.method} ${req.originalUrl}] ${err.message}\n${err.stack}`);

    // Don't leak stack traces in production
    const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
    res.status(500).json({ error: message });
}
