import { Request, Response } from 'express';
import { sendError } from '../../utils/error';

const MAX_TEXT_LENGTH = 10_000;

export type CreateJobData = {
    text: string;
};

export const validateCreateJob = (req: Request, res: Response): CreateJobData | Response => {
    const { text } = req.body ?? {};

    if (text === undefined || text === null) {
        return sendError(res, 400, 'Campo "text" es requerido');
    }

    if (typeof text !== 'string') {
        return sendError(res, 400, 'El campo "text" debe ser un string');
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return sendError(res, 400, 'El campo "text" no puede estar vacío');
    }

    if (trimmed.length > MAX_TEXT_LENGTH) {
        return sendError(res, 400, `El campo "text" no puede superar ${MAX_TEXT_LENGTH} caracteres`);
    }

    return { text: trimmed };
};
