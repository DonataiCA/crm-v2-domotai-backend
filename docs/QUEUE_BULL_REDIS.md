# Cola Bull + Redis

Este documento describe el flujo de la cola de jobs con Bull y Redis: cómo se crea un job desde una ruta HTTP y cómo se procesa en segundo plano.

## Requisitos

- **Node.js** (versión usada en el proyecto)
- **Redis** en ejecución. Por defecto se espera `localhost:6379`.
- Variable de entorno **`REDIS_URL`** (ejemplo: `redis://localhost:6379`). Ver `env.example`.

### Levantar Redis con Docker

```bash
docker run -d -p 6379:6379 --name redis redis:alpine
```

Si Redis no está disponible, Bull intentará reconectar; la app puede arrancar pero los jobs no se procesarán hasta que Redis responda.

---

## Estructura

| Qué | Dónde |
|-----|--------|
| **ID/nombre de la cola** | `src/config/queue.ts` — constante `QUEUE_NAME` |
| **Crear el job** | Ruta `POST /queue/jobs` → `src/controllers/queue.controller.ts` → `textQueue.add()` |
| **Procesar el job** | `src/workers/queue.processor.ts` — ahí va la lógica de negocio (comentarios en el código) |

---

## Flujo paso a paso

1. **Cliente** envía `POST /queue/jobs` con body JSON: `{ "text": "Mi texto" }`.
2. **Validador** (`src/validators/queue/create-job.validator.ts`) comprueba que `text` exista, sea string y no supere el límite.
3. **Controlador** (`src/controllers/queue.controller.ts`) encola el job con `textQueue.add({ text })`. Bull persiste el job en Redis.
4. **Respuesta** al cliente: `201` con `{ message, jobId }`.
5. **Procesador** (`src/workers/queue.processor.ts`), que corre en el mismo proceso que Express, consume la cola con `textQueue.process()`. Cuando hay un job:
   - Recibe `job.data` (p. ej. `{ text: "Mi texto" }`).
   - Por defecto hace un log del texto (ejemplo).
   - Los comentarios en el archivo indican **dónde agregar la lógica real** (emails, APIs, BD, etc.).

Todo el almacenamiento de la cola y los jobs lo hace Bull usando Redis; no hace falta usar Redis directamente en el código.

---

## Cómo probar

1. Asegúrate de que Redis esté corriendo y de que `REDIS_URL` esté en tu `.env`.
2. Inicia el servidor: `npm run dev`.
3. Envía un job:

```bash
curl -X POST http://localhost:3000/queue/jobs \
  -H "Content-Type: application/json" \
  -d '{"text": "Hola cola"}'
```

4. En la consola del servidor deberías ver un log del procesador con el texto, por ejemplo: `[Queue] Job 1 procesado - texto: Hola cola`.

Con Postman: método **POST**, URL `http://localhost:3000/queue/jobs`, body **raw** → **JSON**: `{ "text": "Hola cola" }`.

---

## Dónde definir el ID de la cola y dónde agregar lógica

- **ID de la cola:** en un solo lugar, en `src/config/queue.ts`, en la constante `QUEUE_NAME`. El controlador y el procesador usan la misma instancia `textQueue`, así que no hace falta repetir el nombre en otros archivos; si creas más colas, define allí constantes nuevas (p. ej. `QUEUE_NAME_EMAIL`).
- **Lógica al encolar:** en `src/controllers/queue.controller.ts`, antes de `textQueue.add()` (validaciones de negocio, métricas, etc.).
- **Lógica de procesamiento:** en `src/workers/queue.processor.ts`, dentro del callback de `textQueue.process()`. Ahí van envíos, cálculos, llamadas externas, etc. Si lanzas un error, Bull puede marcar el job como failed y reintentar según la configuración que definas.
