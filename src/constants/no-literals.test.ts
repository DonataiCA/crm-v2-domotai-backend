import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

/**
 * Grafías Title Case de estado de proyecto. Si aparecen fuera de
 * `constants/`, alguien volvió a escribir el catálogo a mano y la deriva
 * empieza otra vez: es literalmente así como apareció el bug de
 * 'Archived' vs 'ARCHIVED'.
 */
const FORBIDDEN = [
    "'Not Started'", "'In Progress'", "'On Hold'", "'Completed'", "'Archived'",
    '"Not Started"', '"In Progress"', '"On Hold"', '"Completed"', '"Archived"',
];

/** `constants/` es donde el catálogo vive; sus tests citan las variantes a propósito. */
const EXEMPT_DIRS = ['constants'];

/**
 * Los tests quedan fuera porque un test de validación **tiene** que citar el
 * vocabulario prohibido para demostrar que se rechaza: `project.validator.test.ts`
 * comprueba justamente que 'Not Started' y 'Archived' ya no pasan. La regla es
 * sobre el código que escribe en base, no sobre el que verifica que no se puede.
 */
function isTest(file: string): boolean {
    return file.endsWith('.test.ts');
}

function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (EXEMPT_DIRS.includes(entry.name)) continue;
            yield* walk(full);
        } else if (entry.name.endsWith('.ts') && !isTest(entry.name)) {
            yield full;
        }
    }
}

describe('literales de estado de proyecto', () => {
    it('ningún archivo fuera de constants/ escribe un estado en Title Case', () => {
        const offenders: string[] = [];

        for (const file of walk(SRC)) {
            const source = readFileSync(file, 'utf8');
            for (const literal of FORBIDDEN) {
                if (source.includes(literal)) {
                    offenders.push(`${file.replace(SRC, 'src')} → ${literal}`);
                }
            }
        }

        expect(offenders, `escriben el catálogo a mano:\n${offenders.join('\n')}`).toEqual([]);
    });
});
