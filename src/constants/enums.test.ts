import { describe, it, expect } from 'vitest';
import {
    TASK_STATUSES,
    TASK_PRIORITIES,
    PROJECT_STATUSES,
    PHASE_STATUSES,
    INVOICE_STATUSES,
    SHARE_PERMISSIONS,
    DEFAULT_SHARE_PERMISSIONS,
    isSharePermission,
    normalizeSharePermissions,
    DEFAULT_TASK_STATUS,
    DEFAULT_TASK_PRIORITY,
    DEFAULT_PROJECT_STATUS,
    ARCHIVED_PROJECT_STATUS,
    TASK_STATUS_ALIASES,
    PROJECT_STATUS_ALIASES,
    normalizeTaskStatus,
    normalizeTaskPriority,
    normalizeProjectStatus,
    normalizePhaseStatus,
    normalizeInvoiceStatus,
    isCompletedStatus,
    slugifyStage,
} from './enums';

describe('catálogo de enums', () => {
    it('expone los cuatro estados de tarea canónicos', () => {
        expect([...TASK_STATUSES]).toEqual(['TODO', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED']);
    });

    it('expone las cuatro prioridades canónicas', () => {
        expect([...TASK_PRIORITIES]).toEqual(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
    });

    it('incluye ARCHIVED entre los estados de proyecto', () => {
        expect(PROJECT_STATUSES).toContain('ARCHIVED');
    });

    it('expone los cinco estados de proyecto en orden', () => {
        expect([...PROJECT_STATUSES]).toEqual(['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']);
    });

    it('expone los tres estados de fase, en minúscula', () => {
        expect([...PHASE_STATUSES]).toEqual(['active', 'completed', 'on_hold']);
    });

    it('expone los cinco estados de factura', () => {
        expect([...INVOICE_STATUSES]).toEqual(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']);
    });

    it('ningún catálogo tiene valores duplicados', () => {
        const catalogos = {
            TASK_STATUSES,
            TASK_PRIORITIES,
            PROJECT_STATUSES,
            PHASE_STATUSES,
            INVOICE_STATUSES,
            SHARE_PERMISSIONS,
        };
        for (const [nombre, catalogo] of Object.entries(catalogos)) {
            const unicos = new Set(catalogo);
            expect(unicos.size, `${nombre} tiene duplicados`).toBe(catalogo.length);
        }
    });

    it('los alias de estado de tarea nunca colisionan con un valor ya canónico', () => {
        for (const alias of Object.keys(TASK_STATUS_ALIASES)) {
            expect(TASK_STATUSES, `"${alias}" ya es canónico: el alias es código muerto`).not.toContain(alias);
        }
    });

    it('los alias de estado de proyecto nunca colisionan con un valor ya canónico', () => {
        for (const alias of Object.keys(PROJECT_STATUS_ALIASES)) {
            expect(PROJECT_STATUSES, `"${alias}" ya es canónico: el alias es código muerto`).not.toContain(alias);
        }
    });

    it('el alias CANCELED de factura no colisiona con el canónico CANCELLED', () => {
        expect(INVOICE_STATUSES).not.toContain('CANCELED');
        expect(INVOICE_STATUSES).toContain('CANCELLED');
    });

    it('todos los alias de estado de tarea apuntan a un valor canónico real', () => {
        for (const canon of Object.values(TASK_STATUS_ALIASES)) {
            expect(TASK_STATUSES).toContain(canon);
        }
    });

    it('todos los alias de estado de proyecto apuntan a un valor canónico real', () => {
        for (const canon of Object.values(PROJECT_STATUS_ALIASES)) {
            expect(PROJECT_STATUSES).toContain(canon);
        }
    });
});

describe('valores por defecto', () => {
    it('DEFAULT_TASK_STATUS es TODO y pertenece al catálogo', () => {
        expect(DEFAULT_TASK_STATUS).toBe('TODO');
        expect(TASK_STATUSES).toContain(DEFAULT_TASK_STATUS);
    });

    it('DEFAULT_TASK_PRIORITY es MEDIUM y pertenece al catálogo', () => {
        expect(DEFAULT_TASK_PRIORITY).toBe('MEDIUM');
        expect(TASK_PRIORITIES).toContain(DEFAULT_TASK_PRIORITY);
    });

    it('DEFAULT_PROJECT_STATUS es NOT_STARTED y pertenece al catálogo', () => {
        expect(DEFAULT_PROJECT_STATUS).toBe('NOT_STARTED');
        expect(PROJECT_STATUSES).toContain(DEFAULT_PROJECT_STATUS);
    });

    it('ARCHIVED_PROJECT_STATUS es ARCHIVED y pertenece al catálogo', () => {
        expect(ARCHIVED_PROJECT_STATUS).toBe('ARCHIVED');
        expect(PROJECT_STATUSES).toContain(ARCHIVED_PROJECT_STATUS);
    });
});

describe('normalizeTaskStatus', () => {
    it('lleva variantes históricas a la forma canónica', () => {
        expect(normalizeTaskStatus('done')).toBe('COMPLETED');
        expect(normalizeTaskStatus('DONE')).toBe('COMPLETED');
        expect(normalizeTaskStatus('completed')).toBe('COMPLETED');
        expect(normalizeTaskStatus('In Progress')).toBe('IN_PROGRESS');
        expect(normalizeTaskStatus('on hold')).toBe('ON_HOLD');
        expect(normalizeTaskStatus('  todo ')).toBe('TODO');
    });

    it('devuelve null para lo que no reconoce', () => {
        expect(normalizeTaskStatus('urgentísimo')).toBeNull();
        expect(normalizeTaskStatus('')).toBeNull();
        expect(normalizeTaskStatus(null)).toBeNull();
    });

    it('cubre el resto de alias declarados', () => {
        expect(normalizeTaskStatus('complete')).toBe('COMPLETED');
        expect(normalizeTaskStatus('pending')).toBe('TODO');
        expect(normalizeTaskStatus('not_started')).toBe('TODO');
        expect(normalizeTaskStatus('Not Started')).toBe('TODO');
        expect(normalizeTaskStatus('in_review')).toBe('IN_PROGRESS');
        expect(normalizeTaskStatus('blocked')).toBe('ON_HOLD');
        expect(normalizeTaskStatus('paused')).toBe('ON_HOLD');
    });

    it('trata casos límite: undefined, espacios y guiones internos', () => {
        expect(normalizeTaskStatus(undefined)).toBeNull();
        expect(normalizeTaskStatus('   ')).toBeNull();
        expect(normalizeTaskStatus('in-progress')).toBe('IN_PROGRESS');
        expect(normalizeTaskStatus('IN-PROGRESS')).toBe('IN_PROGRESS');
        expect(normalizeTaskStatus('  In - Progress  ')).toBe('IN_PROGRESS');
    });

    it('es idempotente sobre valores ya canónicos', () => {
        for (const status of TASK_STATUSES) {
            expect(normalizeTaskStatus(status)).toBe(status);
        }
    });
});

describe('normalizeTaskPriority', () => {
    it('lleva cualquier casing y espacios a la forma canónica', () => {
        expect(normalizeTaskPriority('low')).toBe('LOW');
        expect(normalizeTaskPriority('Medium')).toBe('MEDIUM');
        expect(normalizeTaskPriority(' high ')).toBe('HIGH');
        expect(normalizeTaskPriority('URGENT')).toBe('URGENT');
    });

    it('devuelve null para lo que no reconoce', () => {
        expect(normalizeTaskPriority('crítica')).toBeNull();
        expect(normalizeTaskPriority('')).toBeNull();
        expect(normalizeTaskPriority('   ')).toBeNull();
        expect(normalizeTaskPriority(null)).toBeNull();
        expect(normalizeTaskPriority(undefined)).toBeNull();
    });

    it('es idempotente sobre valores ya canónicos', () => {
        for (const priority of TASK_PRIORITIES) {
            expect(normalizeTaskPriority(priority)).toBe(priority);
        }
    });
});

describe('normalizeProjectStatus', () => {
    it('cubre el bug de Archived vs ARCHIVED', () => {
        expect(normalizeProjectStatus('Archived')).toBe('ARCHIVED');
        expect(normalizeProjectStatus('ARCHIVED')).toBe('ARCHIVED');
        expect(normalizeProjectStatus('Not Started')).toBe('NOT_STARTED');
        expect(normalizeProjectStatus('In Progress')).toBe('IN_PROGRESS');
    });

    it('cubre los alias declarados', () => {
        expect(normalizeProjectStatus('active')).toBe('IN_PROGRESS');
        expect(normalizeProjectStatus('ACTIVE')).toBe('IN_PROGRESS');
        expect(normalizeProjectStatus('done')).toBe('COMPLETED');
        expect(normalizeProjectStatus('paused')).toBe('ON_HOLD');
    });

    it('devuelve null para lo que no reconoce', () => {
        expect(normalizeProjectStatus('cancelado')).toBeNull();
        expect(normalizeProjectStatus('')).toBeNull();
        expect(normalizeProjectStatus('   ')).toBeNull();
        expect(normalizeProjectStatus(null)).toBeNull();
        expect(normalizeProjectStatus(undefined)).toBeNull();
    });

    it('trata el guion interno igual que el espacio', () => {
        expect(normalizeProjectStatus('not-started')).toBe('NOT_STARTED');
        expect(normalizeProjectStatus('on-hold')).toBe('ON_HOLD');
    });

    it('es idempotente sobre valores ya canónicos', () => {
        for (const status of PROJECT_STATUSES) {
            expect(normalizeProjectStatus(status)).toBe(status);
        }
    });
});

describe('normalizePhaseStatus', () => {
    // El único normalizador que canonicaliza a minúscula: el resto va a MAYÚSCULA.
    it('lleva cualquier variante de ON_HOLD a on_hold en minúscula', () => {
        expect(normalizePhaseStatus('ON_HOLD')).toBe('on_hold');
        expect(normalizePhaseStatus('On Hold')).toBe('on_hold');
        expect(normalizePhaseStatus('on hold')).toBe('on_hold');
    });

    it('normaliza active y completed en cualquier casing', () => {
        expect(normalizePhaseStatus('ACTIVE')).toBe('active');
        expect(normalizePhaseStatus('Active')).toBe('active');
        expect(normalizePhaseStatus('active')).toBe('active');
        expect(normalizePhaseStatus('COMPLETED')).toBe('completed');
        expect(normalizePhaseStatus('Completed')).toBe('completed');
    });

    it('devuelve null para lo que no reconoce', () => {
        expect(normalizePhaseStatus('archived')).toBeNull();
        expect(normalizePhaseStatus('')).toBeNull();
        expect(normalizePhaseStatus('   ')).toBeNull();
        expect(normalizePhaseStatus(null)).toBeNull();
        expect(normalizePhaseStatus(undefined)).toBeNull();
    });

    it('trata el guion interno igual que el espacio', () => {
        expect(normalizePhaseStatus('on-hold')).toBe('on_hold');
        expect(normalizePhaseStatus('ON-HOLD')).toBe('on_hold');
    });

    it('es idempotente sobre valores ya canónicos', () => {
        for (const status of PHASE_STATUSES) {
            expect(normalizePhaseStatus(status)).toBe(status);
        }
    });
});

describe('normalizeInvoiceStatus', () => {
    it('lleva cualquier casing y espacios a la forma canónica', () => {
        expect(normalizeInvoiceStatus('draft')).toBe('DRAFT');
        expect(normalizeInvoiceStatus('Sent')).toBe('SENT');
        expect(normalizeInvoiceStatus(' paid ')).toBe('PAID');
        expect(normalizeInvoiceStatus('OVERDUE')).toBe('OVERDUE');
    });

    it('normaliza el alias CANCELED (una sola L) a CANCELLED', () => {
        expect(normalizeInvoiceStatus('CANCELED')).toBe('CANCELLED');
        expect(normalizeInvoiceStatus('canceled')).toBe('CANCELLED');
        expect(normalizeInvoiceStatus('Canceled')).toBe('CANCELLED');
        expect(normalizeInvoiceStatus('  canceled  ')).toBe('CANCELLED');
        expect(normalizeInvoiceStatus('CANCELLED')).toBe('CANCELLED');
        expect(normalizeInvoiceStatus('cancelled')).toBe('CANCELLED');
    });

    it('devuelve null para lo que no reconoce', () => {
        expect(normalizeInvoiceStatus('rechazada')).toBeNull();
        expect(normalizeInvoiceStatus('')).toBeNull();
        expect(normalizeInvoiceStatus('   ')).toBeNull();
        expect(normalizeInvoiceStatus(null)).toBeNull();
        expect(normalizeInvoiceStatus(undefined)).toBeNull();
    });

    it('es idempotente sobre valores ya canónicos', () => {
        for (const status of INVOICE_STATUSES) {
            expect(normalizeInvoiceStatus(status)).toBe(status);
        }
    });
});

describe('isCompletedStatus', () => {
    it('reemplaza el array COMPLETED_STATES de capacity.repository', () => {
        for (const v of ['COMPLETED', 'DONE', 'completed', 'done']) {
            expect(isCompletedStatus(v)).toBe(true);
        }
        expect(isCompletedStatus('TODO')).toBe(false);
    });

    it('también reconoce el alias complete', () => {
        expect(isCompletedStatus('complete')).toBe(true);
        expect(isCompletedStatus('COMPLETE')).toBe(true);
    });

    it('devuelve false para valores ausentes o desconocidos', () => {
        expect(isCompletedStatus(null)).toBe(false);
        expect(isCompletedStatus(undefined)).toBe(false);
        expect(isCompletedStatus('')).toBe(false);
        expect(isCompletedStatus('   ')).toBe(false);
        expect(isCompletedStatus('urgentísimo')).toBe(false);
    });
});

describe('SHARE_PERMISSIONS', () => {
    it('usa el vocabulario real del portal, en minúscula', () => {
        expect([...SHARE_PERMISSIONS]).toEqual(['view', 'comment', 'create_task', 'edit_task']);
    });

    it('cubre los tres permisos que portal.controller comprueba', () => {
        // portal.controller.ts:382, 463 y 515
        for (const p of ['comment', 'create_task', 'edit_task']) {
            expect(isSharePermission(p)).toBe(true);
        }
    });

    it('rechaza el vocabulario en mayúscula que declaraba el catálogo viejo', () => {
        expect(isSharePermission('VIEW')).toBe(false);
        expect(isSharePermission('EDIT')).toBe(false);
    });
});

describe('normalizeSharePermissions', () => {
    it('acepta las tres combinaciones que hay en la base', () => {
        expect(normalizeSharePermissions('view')).toBe('view');
        expect(normalizeSharePermissions('view,comment')).toBe('view,comment');
        expect(normalizeSharePermissions('view,comment,create_task,edit_task'))
            .toBe('view,comment,create_task,edit_task');
    });

    it('acepta un array y lo devuelve como CSV', () => {
        expect(normalizeSharePermissions(['view', 'comment'])).toBe('view,comment');
    });

    it('tolera espacios y casing sin tolerar valores inventados', () => {
        expect(normalizeSharePermissions(' View , COMMENT ')).toBe('view,comment');
        expect(normalizeSharePermissions('view,borrar_todo')).toBeNull();
    });

    it('devuelve null para vacío', () => {
        expect(normalizeSharePermissions('')).toBeNull();
        expect(normalizeSharePermissions(null)).toBeNull();
        expect(normalizeSharePermissions([])).toBeNull();
    });

    it('elimina duplicados conservando el orden del catálogo', () => {
        expect(normalizeSharePermissions('comment,view,comment')).toBe('view,comment');
    });
});

describe('DEFAULT_SHARE_PERMISSIONS', () => {
    it('coincide con el default que portal.controller ya aplicaba', () => {
        expect(DEFAULT_SHARE_PERMISSIONS).toBe('view,comment');
        expect(normalizeSharePermissions(DEFAULT_SHARE_PERMISSIONS)).toBe('view,comment');
    });
});

describe('slugifyStage', () => {
    it('quita acentos, que es exactamente lo que separa el name del slug', () => {
        expect(slugifyStage('Negociación')).toBe('negociacion');
        expect(slugifyStage('Propuesta')).toBe('propuesta');
    });

    it('reproduce los seis slugs reales del pipeline comercial', () => {
        const pares: Array<[string, string]> = [
            ['Nuevo', 'nuevo'],
            ['Contactado', 'contactado'],
            ['Negociación', 'negociacion'],
            ['Propuesta', 'propuesta'],
            ['Ganado', 'ganado'],
            ['Perdido', 'perdido'],
        ];
        for (const [name, slug] of pares) {
            expect(slugifyStage(name), name).toBe(slug);
        }
    });

    it('unifica espacios y guiones en guion bajo', () => {
        expect(slugifyStage('Primera reunión')).toBe('primera_reunion');
        expect(slugifyStage('closed-won')).toBe('closed_won');
    });

    it('es idempotente: aplicarlo a un slug lo deja igual', () => {
        expect(slugifyStage('negociacion')).toBe('negociacion');
        expect(slugifyStage(slugifyStage('Negociación'))).toBe('negociacion');
    });

    it('devuelve cadena vacía para valores ausentes', () => {
        expect(slugifyStage(null)).toBe('');
        expect(slugifyStage(undefined)).toBe('');
        expect(slugifyStage('   ')).toBe('');
    });
});
