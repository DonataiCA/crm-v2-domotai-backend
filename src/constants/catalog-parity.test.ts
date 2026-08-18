import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_STATUSES, TASK_STATUSES, TASK_PRIORITIES } from './enums';

/**
 * Los dos repos son independientes y no comparten paquete, así que la única
 * forma de garantizar que sus catálogos coinciden es leer el archivo del otro.
 * Si el frontend no está clonado al lado (CI del backend suelto), el test se
 * salta en vez de fallar: sería un falso rojo, no una divergencia.
 */
const FRONTEND_ENUMS = join(
    __dirname, '..', '..', '..', 'crm-v2-domotai-frontend', 'src', 'constants', 'enums.ts',
);

const available = existsSync(FRONTEND_ENUMS);
const source = available ? readFileSync(FRONTEND_ENUMS, 'utf8') : '';

/** Extrae los valores de un objeto `as const` del frontend. */
function valuesOf(constName: string): string[] {
    const block = source.match(new RegExp(`export const ${constName} = \\{([\\s\\S]*?)\\} as const;`));
    if (!block) return [];
    return [...block[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
}

describe.skipIf(!available)('paridad de catálogos entre backend y frontend', () => {
    it('los estados de proyecto son idénticos y en el mismo orden', () => {
        expect(valuesOf('ProjectStatus')).toEqual([...PROJECT_STATUSES]);
    });

    it('los estados de tarea son idénticos', () => {
        expect(valuesOf('TaskStatus').sort()).toEqual([...TASK_STATUSES].sort());
    });

    it('las prioridades son idénticas', () => {
        expect(valuesOf('TaskPriority').sort()).toEqual([...TASK_PRIORITIES].sort());
    });

    it('el frontend no reintroduce un catálogo estático de etapas de lead', () => {
        // Las etapas son filas de pipeline_stages, configurables por organización.
        expect(source).not.toMatch(/export const LeadStage\b/);
    });
});
