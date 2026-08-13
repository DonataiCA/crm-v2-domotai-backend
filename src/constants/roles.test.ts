import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
    DEFAULT_ORG_ROLE,
    DEFAULT_PROFILE_ROLE,
    ORG_ROLES,
    PROFILE_ROLES,
    TEAM_ROLES,
    isAdminRole,
    isClientRole,
    isOrgRole,
    isProfileRole,
    isTeamRole,
    normalizeRole,
} from './roles';
import { updateSchema } from '../validators/user/update.validator';
import { addMemberSchema } from '../validators/organization.validator';

describe('normalizeRole', () => {
    it('lleva cualquier casing a minúscula', () => {
        expect(normalizeRole('Admin')).toBe('admin');
        expect(normalizeRole('ADMIN')).toBe('admin');
        expect(normalizeRole('admin')).toBe('admin');
    });

    it('recorta espacios sobrantes', () => {
        expect(normalizeRole('  admin  ')).toBe('admin');
        expect(normalizeRole(' ADMIN ')).toBe('admin');
    });

    it('unifica espacios y guiones en guion bajo', () => {
        expect(normalizeRole('On Hold')).toBe('on_hold');
        expect(normalizeRole('free-lancer')).toBe('free_lancer');
        expect(normalizeRole('a  -  b')).toBe('a_b');
    });

    it('devuelve cadena vacía para valores ausentes', () => {
        expect(normalizeRole(null)).toBe('');
        expect(normalizeRole(undefined)).toBe('');
        expect(normalizeRole('')).toBe('');
        expect(normalizeRole('   ')).toBe('');
    });

    it('es idempotente sobre valores ya canónicos', () => {
        for (const role of PROFILE_ROLES) {
            expect(normalizeRole(role)).toBe(role);
            expect(normalizeRole(normalizeRole(role))).toBe(role);
        }
    });
});

describe('catálogo', () => {
    it('declara los cinco roles de perfil', () => {
        expect([...PROFILE_ROLES]).toEqual(['admin', 'salesman', 'freelancer', 'client', 'viewer']);
    });

    it('declara los tres roles de organización', () => {
        expect([...ORG_ROLES]).toEqual(['admin', 'member', 'client']);
    });

    it('TEAM_ROLES es un subconjunto de PROFILE_ROLES', () => {
        for (const role of TEAM_ROLES) {
            expect(PROFILE_ROLES).toContain(role);
        }
    });

    it('excluye a client y viewer del equipo interno', () => {
        expect(TEAM_ROLES).not.toContain('client');
        expect(TEAM_ROLES).not.toContain('viewer');
    });

    it('los valores por defecto pertenecen a su catálogo', () => {
        expect(PROFILE_ROLES).toContain(DEFAULT_PROFILE_ROLE);
        expect(ORG_ROLES).toContain(DEFAULT_ORG_ROLE);
    });

    it('todos los valores del catálogo ya están en forma canónica', () => {
        for (const role of [...PROFILE_ROLES, ...ORG_ROLES]) {
            expect(role).toBe(normalizeRole(role));
        }
    });
});

describe('predicados', () => {
    // El punto de todo el módulo: da igual cómo esté guardado el valor.
    it('isAdminRole tolera el casing', () => {
        expect(isAdminRole('admin')).toBe(true);
        expect(isAdminRole('Admin')).toBe(true);
        expect(isAdminRole(' ADMIN ')).toBe(true);
    });

    it('isAdminRole rechaza cualquier otro rol', () => {
        expect(isAdminRole('salesman')).toBe(false);
        expect(isAdminRole('client')).toBe(false);
        expect(isAdminRole('administrador')).toBe(false);
        expect(isAdminRole('')).toBe(false);
        expect(isAdminRole(null)).toBe(false);
        expect(isAdminRole(undefined)).toBe(false);
    });

    it('isClientRole tolera el casing', () => {
        expect(isClientRole('client')).toBe(true);
        expect(isClientRole('Client')).toBe(true);
        expect(isClientRole('CLIENT')).toBe(true);
    });

    it('isClientRole distingue client de viewer', () => {
        expect(isClientRole('viewer')).toBe(false);
        expect(isClientRole('admin')).toBe(false);
        expect(isClientRole(null)).toBe(false);
    });

    it('isTeamRole acepta los tres roles internos en cualquier casing', () => {
        expect(isTeamRole('admin')).toBe(true);
        expect(isTeamRole('Salesman')).toBe(true);
        expect(isTeamRole('FREELANCER')).toBe(true);
    });

    it('isTeamRole rechaza client, viewer y desconocidos', () => {
        expect(isTeamRole('client')).toBe(false);
        expect(isTeamRole('viewer')).toBe(false);
        expect(isTeamRole('superuser')).toBe(false);
        expect(isTeamRole(null)).toBe(false);
    });

    it('isProfileRole valida contra el catálogo completo', () => {
        expect(isProfileRole('Viewer')).toBe(true);
        expect(isProfileRole('client')).toBe(true);
        expect(isProfileRole('superuser')).toBe(false);
        expect(isProfileRole('member')).toBe(false); // member es de organización, no de perfil
        expect(isProfileRole(null)).toBe(false);
    });

    it('isOrgRole valida contra el catálogo de organización', () => {
        expect(isOrgRole('Member')).toBe(true);
        expect(isOrgRole('admin')).toBe(true);
        expect(isOrgRole('salesman')).toBe(false); // salesman es de perfil, no de organización
        expect(isOrgRole('owner')).toBe(false);
    });
});

describe('validador de perfil (updateSchema)', () => {
    // Tolerante al casing, estricto con el conjunto: el rol decide accesos, así
    // que un valor desconocido debe fallar en vez de degradarse en silencio.
    it('normaliza el casing de un rol válido', () => {
        expect(updateSchema.parse({ role: 'Admin' })).toEqual({ role: 'admin' });
        expect(updateSchema.parse({ role: '  CLIENT ' })).toEqual({ role: 'client' });
    });

    it('acepta los cinco roles del catálogo', () => {
        for (const role of PROFILE_ROLES) {
            expect(updateSchema.safeParse({ role }).success).toBe(true);
        }
    });

    it('rechaza un rol fuera del catálogo', () => {
        expect(updateSchema.safeParse({ role: 'superuser' }).success).toBe(false);
        expect(updateSchema.safeParse({ role: 'member' }).success).toBe(false);
        expect(updateSchema.safeParse({ role: '' }).success).toBe(false);
    });

    it('el rol sigue siendo opcional', () => {
        expect(updateSchema.safeParse({ fullName: 'Ada Lovelace' }).success).toBe(true);
        expect(updateSchema.parse({ fullName: 'Ada Lovelace' })).not.toHaveProperty('role');
    });
});

describe('validador de organización (addMemberSchema)', () => {
    const userId = '11111111-1111-1111-1111-111111111111';

    it('normaliza el casing de un rol válido', () => {
        expect(addMemberSchema.parse({ userId, role: 'Member' }).role).toBe('member');
        expect(addMemberSchema.parse({ userId, role: 'ADMIN' }).role).toBe('admin');
    });

    it('aplica el rol por defecto cuando no se envía', () => {
        expect(addMemberSchema.parse({ userId }).role).toBe(DEFAULT_ORG_ROLE);
    });

    it('rechaza un rol fuera del catálogo', () => {
        expect(addMemberSchema.safeParse({ userId, role: 'owner' }).success).toBe(false);
        expect(addMemberSchema.safeParse({ userId, role: 'salesman' }).success).toBe(false);
    });
});

/**
 * El catálogo está duplicado en backend y frontend a propósito (no hay monorepo),
 * y este test es la única red que impide que se desincronicen.
 *
 * Se omite si el frontend no está presente, para que el backend pueda testearse
 * desplegado por separado.
 */
const FRONTEND_ENUMS = path.resolve(process.cwd(), '../crm-v2-domotai-frontend/src/constants/enums.ts');
const frontendPresent = fs.existsSync(FRONTEND_ENUMS);

describe.skipIf(!frontendPresent)('paridad con el catálogo del frontend', () => {
    let front: typeof import('../../../crm-v2-domotai-frontend/src/constants/enums');

    beforeAll(async () => {
        front = await import('../../../crm-v2-domotai-frontend/src/constants/enums');
    });

    it('declara exactamente los mismos roles de perfil', () => {
        expect(Object.values(front.UserRole).sort()).toEqual([...PROFILE_ROLES].sort());
    });

    it('declara exactamente los mismos roles de organización', () => {
        expect(Object.values(front.OrgRole).sort()).toEqual([...ORG_ROLES].sort());
    });

    it('coincide en qué roles son equipo interno', () => {
        expect([...front.TEAM_ROLES].sort()).toEqual([...TEAM_ROLES].sort());
    });

    it('normalizeRole se comporta igual en ambos lados', () => {
        const casos = ['Admin', ' ADMIN ', 'admin', 'On Hold', 'free-lancer', '', '   ', 'Superuser'];
        for (const caso of casos) {
            expect(front.normalizeRole(caso)).toBe(normalizeRole(caso));
        }
        expect(front.normalizeRole(null)).toBe(normalizeRole(null));
        expect(front.normalizeRole(undefined)).toBe(normalizeRole(undefined));
    });

    it('los predicados equivalentes dan el mismo veredicto', () => {
        const casos = ['admin', 'Admin', 'salesman', 'freelancer', 'client', 'CLIENT', 'viewer', 'superuser', ''];
        for (const caso of casos) {
            expect(front.isAdminRole(caso)).toBe(isAdminRole(caso));
            expect(front.isClientRole(caso)).toBe(isClientRole(caso));
            expect(front.isTeamMemberRole(caso)).toBe(isTeamRole(caso));
        }
    });
});
