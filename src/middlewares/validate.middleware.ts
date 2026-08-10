import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = schema.parse(req[source]);
            req[source] = parsed;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
                return res.status(400).json({
                    error: 'Validation failed',
                    details: messages,
                });
            }
            next(error);
        }
    };
}
