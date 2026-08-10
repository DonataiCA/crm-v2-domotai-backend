import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { validateCreateJob } from '../validators/queue/create-job.validator';
import { textQueue } from '../config/queue';

export const QueueController = {
    /**
     * Crea un job en la cola con el texto recibido.
     * Aquí se puede agregar lógica previa antes de encolar (validaciones de negocio, métricas, etc.).
     * La lógica pesada de procesamiento va en el worker (src/workers/queue.processor.ts).
     */
    createJob: async (req: Request, res: Response) => {
        try {
            const validationResult = validateCreateJob(req, res);
            if ('status' in validationResult) {
                return;
            }

            const { text } = validationResult;

            const job = await textQueue.add({ text });

            res.status(201).json({
                message: 'Job encolado correctamente',
                jobId: job.id?.toString() ?? job.id,
            });
        } catch (error) {
            return sendError(res, 500, 'Error al encolar el job', error);
        }
    },
};
