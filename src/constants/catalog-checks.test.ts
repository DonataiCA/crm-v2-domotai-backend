import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Las restricciones CHECK son lo único que impide que un valor fuera de
 * catálogo entre por una vía que no pase por Zod: psql, un seed, un endpoint
 * nuevo sin validador. Verificarlas una vez a mano no sirve — nadie se
 * enteraría de que una migración futura las tira.
 *
 * Es el único test del repositorio que toca la base. Si no hay base
 * alcanzable se salta en vez de fallar: sería un falso rojo, no una regresión.
 * Nada de lo que hace persiste: los intentos que la base rechaza no escriben
 * por definición, y los que (por el bug que buscamos) pudieran colarse van
 * dentro de una transacción que siempre se revierte.
 */
const prisma = new PrismaClient();

const dbAvailable = await prisma
    .$queryRaw`SELECT 1`
    .then(() => true)
    .catch(() => false);

/** Las diez restricciones que introdujo la migración add_catalog_checks. */
const CONSTRAINTS = [
    'projects_status_check',
    'project_tasks_status_check',
    'project_tasks_priority_check',
    'tasks_status_check',
    'tasks_priority_check',
    'project_phases_status_check',
    'invoices_status_check',
    'project_shares_permissions_check',
    'leads_stage_slug_check',
    'lead_stage_history_slug_check',
];

/**
 * Cada intento va en su propia transacción y termina revertida: en Postgres,
 * un error aborta la transacción entera, así que compartirla haría fallar a
 * los intentos siguientes por un motivo que no es el suyo.
 */
class Rollback extends Error {}

async function isRejected(table: string, sql: string): Promise<'rejected' | 'accepted' | 'no-rows'> {
    const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*) FROM ${table}`,
    );
    if (Number(count) === 0) return 'no-rows';

    try {
        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(sql);
            throw new Rollback();
        });
        return 'accepted';
    } catch (error) {
        return error instanceof Rollback ? 'accepted' : 'rejected';
    }
}

afterAll(async () => { await prisma.$disconnect(); });

describe.skipIf(!dbAvailable)('restricciones CHECK de catálogo', () => {
    it('las diez restricciones existen en la base', async () => {
        const rows = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
            `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname = ANY($1::text[])`,
            CONSTRAINTS,
        );
        const found = rows.map((r) => r.conname).sort();
        expect(found, `faltan: ${CONSTRAINTS.filter((c) => !found.includes(c)).join(', ')}`)
            .toEqual([...CONSTRAINTS].sort());
    });

    const INTENTOS: Array<{ nombre: string; tabla: string; sql: string }> = [
        {
            nombre: "projects.status = 'Archived' (la grafía que rompía el archivado)",
            tabla: 'projects',
            sql: `UPDATE projects SET status='Archived' WHERE id IN (SELECT id FROM projects LIMIT 1)`,
        },
        {
            nombre: "project_tasks.priority = 'urgentísimo'",
            tabla: 'project_tasks',
            sql: `UPDATE project_tasks SET priority='urgentísimo' WHERE id IN (SELECT id FROM project_tasks LIMIT 1)`,
        },
        {
            nombre: "project_shares.permissions = 'VIEW,EDIT' (el vocabulario viejo)",
            tabla: 'project_shares',
            sql: `UPDATE project_shares SET permissions='VIEW,EDIT' WHERE id IN (SELECT id FROM project_shares LIMIT 1)`,
        },
        {
            nombre: "leads.stage = 'Negociación' (el nombre en vez del slug)",
            tabla: 'leads',
            sql: `UPDATE leads SET stage='Negociación' WHERE id IN (SELECT id FROM leads LIMIT 1)`,
        },
        {
            nombre: "invoices.status = 'PENDIENTE'",
            tabla: 'invoices',
            sql: `UPDATE invoices SET status='PENDIENTE' WHERE id IN (SELECT id FROM invoices LIMIT 1)`,
        },
        {
            nombre: "tasks.status = 'Done'",
            tabla: 'tasks',
            sql: `UPDATE tasks SET status='Done' WHERE id IN (SELECT id FROM tasks LIMIT 1)`,
        },
    ];

    for (const intento of INTENTOS) {
        it(`la base rechaza ${intento.nombre}`, async () => {
            const resultado = await isRejected(intento.tabla, intento.sql);
            // 'no-rows' no es un aprobado silencioso: sin filas el UPDATE no
            // prueba nada, y la existencia de la restricción ya la cubre el
            // primer test. Se marca para que se vea en la salida.
            if (resultado === 'no-rows') {
                console.warn(`  ⚠ ${intento.tabla} está vacía: no se pudo probar el comportamiento`);
                return;
            }
            expect(resultado).toBe('rejected');
        });
    }
});
