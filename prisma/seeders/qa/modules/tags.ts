import { PrismaClient } from '@prisma/client';
import { qaId } from '../ids';
import { ORG_A, P_ADMIN } from '../core';
import { PT_EN_CURSO, PT_VENCIDA, PT_SIN_FASE } from './projects';

/**
 * Nota de esquema: Tag.nameLower es @unique GLOBAL, no por organización.
 * Por eso solo se siembran etiquetas en la organización A: repetir el mismo
 * nombre en la B provocaría una violación de unicidad. Es un fallo del
 * esquema, no del seed.
 */
export async function seedTags(prisma: PrismaClient): Promise<string> {
    const tags = [
        { key: 'backend', name: 'QA Backend', color: '#0ea5e9' },
        { key: 'frontend', name: 'QA Frontend', color: '#8b5cf6' },
        { key: 'bloqueante', name: 'QA Bloqueante', color: '#ef4444' },
        { key: 'deuda', name: 'QA Deuda técnica', color: '#f59e0b' },
    ];

    for (const t of tags) {
        const id = qaId(`tag:${t.key}`);
        await prisma.tag.upsert({
            where: { id },
            update: { name: t.name, color: t.color },
            create: {
                id, name: t.name, nameLower: t.name.toLowerCase(),
                color: t.color, organizationId: ORG_A, createdBy: P_ADMIN,
            },
        });
    }

    // Asignaciones a tareas de proyecto (tabla puente con PK compuesta)
    const asignaciones = [
        { projectTaskId: PT_EN_CURSO, tagId: qaId('tag:backend') },
        { projectTaskId: PT_EN_CURSO, tagId: qaId('tag:bloqueante') },
        { projectTaskId: PT_VENCIDA, tagId: qaId('tag:frontend') },
        { projectTaskId: PT_SIN_FASE, tagId: qaId('tag:deuda') },
    ];
    for (const a of asignaciones) {
        await prisma.projectTaskTag.upsert({
            where: { projectTaskId_tagId: a },
            update: {},
            create: a,
        });
    }

    return `${tags.length} etiquetas · ${asignaciones.length} asignaciones (1 tarea con 2 etiquetas)`;
}
