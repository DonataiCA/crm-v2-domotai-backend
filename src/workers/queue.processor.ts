import { textQueue } from '../config/queue';
import { pm2Logger } from '../utils/logger';

/**
 * El ID/nombre de la cola está definido en src/config/queue.ts (QUEUE_NAME).
 * Esta misma cola es la que recibe jobs desde la ruta POST /queue/jobs.
 */
export function startQueueProcessor(): void {
    textQueue.process(async (job) => {
        try {
            const { text } = job.data;

            // --- Ejemplo: solo imprimir el texto ---
            pm2Logger.info(`[Queue] Job ${job.id} procesado - texto: ${text}`);

            // Aquí va la lógica principal de procesamiento del job:
            // envíos de email, cálculos, llamadas a APIs externas, actualizar BD, etc.
            // Si falla, lanzar error para que Bull marque el job como failed y pueda reintentar si lo configuras.
        } catch (error) {
            pm2Logger.error(`[Queue] Error en job ${job.id}: ${String(error)}`);
            throw error;
        }
    });

    textQueue.on('error', (err) => {
        pm2Logger.error(`[Queue] Error de cola: ${err.message}`);
    });

    pm2Logger.info('[Queue] Procesador de cola iniciado');
}
