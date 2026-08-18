/**
 * Límites del documento que se puede adjuntar al chat de tareas.
 *
 * El chat (`POST /projects/:projectId/chat-task`) acepta un archivo de texto arrastrado
 * desde el navegador. El archivo no se sube: se lee en el cliente y su contenido viaja
 * como un campo más del cuerpo JSON, así que aquí no hay nada que extraer ni ningún
 * formato binario que interpretar.
 *
 * `MAX_DOCUMENT_CHARS` es un tope deliberadamente conservador. El contenido acaba dentro
 * del prompt de `parseChatActions`, que ya inyecta hasta 80 tareas existentes, las fases,
 * los miembros y un prompt de sistema largo. Sin este tope, `chat-task` acepta cuerpos de
 * hasta el límite de `express.json` (50 MB) y los manda a `gpt-4o`. Subirlo es cambiar
 * este número; no hay nada más en el diseño que dependa de su valor.
 *
 * El frontend duplica este módulo a propósito, igual que el catálogo de roles: los dos
 * repositorios se despliegan por separado y no hay paquete compartido.
 */

/** Tope del contenido del archivo adjunto, en caracteres. El límite es inclusivo. */
export const MAX_DOCUMENT_CHARS = 3000;

/** Tope de la instrucción escrita a mano en el chat, en caracteres. */
export const MAX_CHAT_MESSAGE_CHARS = 2000;

/**
 * Extensiones que el navegador acepta al arrastrar. Sólo texto plano: no hay extracción
 * de PDF ni de DOCX en ninguna parte de este flujo.
 */
export const ACCEPTED_DOCUMENT_EXTENSIONS = ['.md', '.txt'] as const;
export type AcceptedDocumentExtension = (typeof ACCEPTED_DOCUMENT_EXTENSIONS)[number];

/** Tope del nombre de archivo, que sólo se usa para mostrarlo y para etiquetar el prompt. */
export const MAX_DOCUMENT_FILENAME_CHARS = 255;

/**
 * Tope del archivo de plantilla que acepta `POST /projects/:projectId/import-tasks`.
 *
 * Es mucho más alto que `MAX_DOCUMENT_CHARS` porque este contenido **no entra en ningún
 * prompt**: lo lee `parseTaskTemplate`, que es código y no un modelo. El límite existe
 * sólo para que un archivo absurdo no llegue al parser, y el que manda de verdad es
 * `MAX_TEMPLATE_TASKS`.
 */
export const MAX_TEMPLATE_CHARS = 40000;

/** Tope de tareas por archivo de plantilla. El límite es inclusivo. */
export const MAX_TEMPLATE_TASKS = 100;
