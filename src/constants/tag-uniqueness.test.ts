import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * El nombre de una etiqueta es único dentro de su organización, no en toda la base.
 * Antes `tags.nameLower` era `@unique` global: si la org B ya tenía "Frontend", la org
 * A no podía crearla y el endpoint respondía 500 por el P2002. La importación de tareas
 * crea etiquetas al vuelo, así que esa colisión dejaría de ser rara.
 *
 * Como `catalog-checks.test.ts`, toca la base real y se salta si no hay ninguna. Todo
 * va dentro de transacciones que se revierten: no queda nada escrito.
 */
const prisma = new PrismaClient();

const dbAvailable = await prisma
    .$queryRaw`SELECT 1`
    .then(() => true)
    .catch(() => false);

const ROLLBACK = new Error('rollback');

/** Ejecuta `fn` en una transacción que siempre se revierte y devuelve su error, si lo hubo. */
async function attempt(fn: (tx: any) => Promise<unknown>): Promise<unknown> {
    try {
        await prisma.$transaction(async (tx) => {
            await fn(tx);
            throw ROLLBACK;
        });
    } catch (error) {
        return error === ROLLBACK ? null : error;
    }
    return null;
}

async function twoOrgs(tx: any) {
    const [a, b] = await Promise.all([
        tx.organization.create({ data: { name: 'tag-test-A' } }),
        tx.organization.create({ data: { name: 'tag-test-B' } }),
    ]);
    return [a.id as string, b.id as string];
}

describe.skipIf(!dbAvailable)('tags: unicidad del nombre por organización', () => {
    afterAll(() => prisma.$disconnect());

    it('dos organizaciones pueden tener una etiqueta con el mismo nombre', async () => {
        const error = await attempt(async (tx) => {
            const [orgA, orgB] = await twoOrgs(tx);
            await tx.tag.create({ data: { name: 'Frontend', nameLower: 'frontend', organizationId: orgA } });
            await tx.tag.create({ data: { name: 'Frontend', nameLower: 'frontend', organizationId: orgB } });
        });
        expect(error).toBeNull();
    });

    it('la misma organización no puede repetir el nombre', async () => {
        const error: any = await attempt(async (tx) => {
            const [orgA] = await twoOrgs(tx);
            await tx.tag.create({ data: { name: 'Frontend', nameLower: 'frontend', organizationId: orgA } });
            await tx.tag.create({ data: { name: 'FRONTEND', nameLower: 'frontend', organizationId: orgA } });
        });
        expect(error?.code).toBe('P2002');
    });
});
