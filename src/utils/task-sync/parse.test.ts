import { describe, it, expect } from 'vitest';
import { parseSyncDocument } from './parse';
import { buildExport } from './build-export';
import { MAX_SYNC_TASKS } from './format';
import { makeState, EXPORTED_AT, EXPORTED_BY } from './fixtures.test-helpers';

const exported = () => buildExport(makeState(), { exportedAt: EXPORTED_AT, exportedBy: EXPORTED_BY });
const parse = (doc: unknown) => parseSyncDocument(JSON.stringify(doc));
const messages = (result: ReturnType<typeof parseSyncDocument>) => result.issues.map((i) => `${i.path}: ${i.message}`);

describe('parseSyncDocument', () => {
    it('acepta un export sin tocar', () => {
        const result = parse(exported());
        expect(result.issues).toEqual([]);
        expect(result.tasks).toHaveLength(3);
        expect(result.tasks[0]).toMatchObject({ id: 't-home', status: 'TODO' });
    });

    it('rechaza algo que no es JSON, indicando que no se pudo leer', () => {
        const result = parseSyncDocument('{ "format": ');
        expect(result.tasks).toEqual([]);
        expect(result.issues[0].message).toMatch(/JSON/);
    });

    it('rechaza otro formato u otra versión', () => {
        expect(messages(parse({ ...exported(), format: 'otra-cosa' }))[0]).toMatch(/format/);
        expect(messages(parse({ ...exported(), version: 2 }))[0]).toMatch(/versión 2/);
    });

    it('rechaza un campo desconocido en una tarea en vez de ignorarlo', () => {
        const doc: any = exported();
        doc.tasks[0].estimatedHours = 4;
        expect(messages(parse(doc))).toEqual([expect.stringMatching(/^tasks\[0\]: .*estimatedHours/)]);
    });

    it('normaliza estado y prioridad tolerando mayúsculas y alias, y rechaza los inválidos', () => {
        const doc: any = exported();
        doc.tasks[0].status = 'in progress';
        doc.tasks[1].status = 'DONE';
        doc.tasks[2].priority = 'CRITICA';
        const result = parse(doc);
        expect(messages(result)).toEqual([expect.stringMatching(/^tasks\[2\]\.priority: .*LOW, MEDIUM, HIGH, URGENT/)]);
        doc.tasks[2].priority = 'high';
        const ok = parse(doc);
        expect(ok.tasks.map((t) => t.status)).toEqual(['IN_PROGRESS', 'COMPLETED', 'IN_PROGRESS']);
        expect(ok.tasks[2].priority).toBe('HIGH');
    });

    it('exige fechas reales AAAA-MM-DD y que el vencimiento no sea anterior al inicio', () => {
        const doc: any = exported();
        doc.tasks[0].dueDate = '2026-02-30';
        doc.tasks[2].startDate = '2026-10-10';
        doc.tasks[2].dueDate = '2026-10-01';
        const result = messages(parse(doc));
        expect(result).toContainEqual(expect.stringMatching(/^tasks\[0\]\.dueDate: /));
        expect(result).toContainEqual(expect.stringMatching(/^tasks\[2\]\.dueDate: .*anterior/));
    });

    it('exige progreso entero entre 0 y 100', () => {
        const doc: any = exported();
        doc.tasks[0].progress = 120;
        expect(messages(parse(doc))).toEqual([expect.stringMatching(/^tasks\[0\]\.progress: /)]);
    });

    it('acepta una tarea nueva solo con título y le aplica los valores por defecto', () => {
        const doc: any = exported();
        doc.tasks.push({ title: 'Nueva tarea' });
        const result = parse(doc);
        expect(result.issues).toEqual([]);
        expect(result.tasks[3]).toMatchObject({ id: undefined, title: 'Nueva tarea' });
    });

    it('una tarea existente sin rev es un error: sin él no se pueden detectar conflictos', () => {
        const doc: any = exported();
        delete doc.tasks[0].rev;
        expect(messages(parse(doc))).toEqual([expect.stringMatching(/^tasks\[0\]\.rev: /)]);
    });

    it('detecta ids de tarea y de entregable repetidos', () => {
        const doc: any = exported();
        doc.tasks[1].id = doc.tasks[0].id;
        doc.tasks[2].deliverables = [doc.tasks[2].deliverables, { id: 'x', title: 'a', done: false }, { id: 'x', title: 'b', done: false }].flat();
        const result = messages(parse(doc));
        expect(result).toContainEqual(expect.stringMatching(/^tasks\[1\]\.id: .*repetido/));
        expect(result).toContainEqual(expect.stringMatching(/^tasks\[2\]\.deliverables\[3\]\.id: .*repetido/));
    });

    it('exige un título no vacío', () => {
        const doc: any = exported();
        doc.tasks[0].title = '   ';
        expect(messages(parse(doc))).toEqual([expect.stringMatching(/^tasks\[0\]\.title: /)]);
    });

    it(`no acepta más de ${MAX_SYNC_TASKS} tareas`, () => {
        const doc: any = exported();
        doc.tasks = Array.from({ length: MAX_SYNC_TASKS + 1 }, (_, i) => ({ title: `T${i}` }));
        expect(messages(parse(doc))[0]).toMatch(/^tasks: .*1000/);
    });

    it('acompaña cada error con el título de la tarea para poder localizarla', () => {
        const doc: any = exported();
        doc.tasks[2].progress = -1;
        expect(parse(doc).issues[0].taskTitle).toBe('Endpoint de login');
    });

    it('rechaza un archivo exportado de otro proyecto', () => {
        const doc: any = exported();
        const result = parseSyncDocument(JSON.stringify(doc), { projectId: 'otro-proyecto' });
        expect(result.tasks).toEqual([]);
        expect(result.issues[0]).toMatchObject({ path: 'project.id', message: expect.stringMatching(/Portal de clientes Andina/) });
        expect(parseSyncDocument(JSON.stringify(doc), { projectId: 'proj-1' }).issues).toEqual([]);
    });
});
