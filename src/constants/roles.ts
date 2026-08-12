/**
 * Catálogo canónico de roles.
 *
 * La forma canónica es **minúscula**, que es la que ya guarda `Profile.role`
 * (`@default("salesman")`) y `OrganizationMember.role` (`@default("member")`).
 *
 * Tres sistemas distintos usan la palabra "rol" y no son intercambiables:
 *   - `User.role`   → enum de Prisma (`USER` | `ADMIN`), sólo autenticación. No se toca aquí.
 *   - `Profile.role` → el rol funcional dentro del CRM. Es el que cubre este catálogo.
 *   - `OrganizationMember.role` → el rol dentro de una organización concreta.
 *
 * Los predicados normalizan internamente a propósito: quien los usa no puede
 * olvidarse de hacerlo, que es exactamente cómo aparecieron las comparaciones
 * divergentes que este módulo viene a reemplazar.
 */

export const PROFILE_ROLES = ['admin', 'salesman', 'freelancer', 'client', 'viewer'] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

export const ORG_ROLES = ['admin', 'member', 'client'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Roles internos: los que operan el CRM, por oposición a `client` y `viewer`. */
export const TEAM_ROLES: readonly ProfileRole[] = ['admin', 'salesman', 'freelancer'];

export const DEFAULT_PROFILE_ROLE: ProfileRole = 'salesman';
export const DEFAULT_ORG_ROLE: OrgRole = 'member';

/**
 * Lleva cualquier variante a la forma canónica: `"Admin"`, `" ADMIN "` y
 * `"admin"` colapsan en `"admin"`. Devuelve `''` para valores vacíos.
 */
export function normalizeRole(role: string | null | undefined): string {
    if (!role) return '';
    return String(role).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isProfileRole(role: string | null | undefined): boolean {
    return (PROFILE_ROLES as readonly string[]).includes(normalizeRole(role));
}

export function isOrgRole(role: string | null | undefined): boolean {
    return (ORG_ROLES as readonly string[]).includes(normalizeRole(role));
}

export function isAdminRole(role: string | null | undefined): boolean {
    return normalizeRole(role) === 'admin';
}

export function isClientRole(role: string | null | undefined): boolean {
    return normalizeRole(role) === 'client';
}

/** `true` para admin, salesman y freelancer. */
export function isTeamRole(role: string | null | undefined): boolean {
    return (TEAM_ROLES as readonly string[]).includes(normalizeRole(role));
}
