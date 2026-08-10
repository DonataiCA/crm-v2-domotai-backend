import Queue from 'bull';

/**
 * ID/nombre de la cola en Redis.
 * Reutilizar esta constante en el worker (queue.process) y donde se añadan jobs (queue.add).
 * Si creas más colas, define aquí constantes distintas p. ej. QUEUE_NAME_EMAIL, QUEUE_NAME_REPORTS.
 */
export const QUEUE_NAME = 'example-text-queue';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Instancia de la cola Bull. Usa REDIS_URL para conectar a Redis.
 * El nombre de la cola (QUEUE_NAME) identifica esta cola en Redis.
 */
export const textQueue = new Queue<{ text: string }>(QUEUE_NAME, {
    redis: redisUrl,
});
