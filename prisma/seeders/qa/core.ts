/**
 * Núcleo del seed de QA: organizaciones, usuarios y pipelines.
 * Todos los módulos dependen de esto, así que el orquestador lo ejecuta
 * siempre antes que cualquier módulo suelto.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { qaId } from './ids';

export const QA_PASSWORD = 'QaDomotai2026!';

/** Organización A: datos completos. Organización B: espejo para probar aislamiento. */
export const ORG_A = qaId('org:alpha');
export const ORG_B = qaId('org:beta');

/**
 * Perfiles. OJO: las membresías y los `assignedTo` apuntan a Profile.id.
 *
 * Cada Profile.id se deriva de la MISMA etiqueta que su User.id, de modo que
 * ambos coincidan. No es un detalle cosmético: los controllers guardan
 * `createdBy: (req as any).userId` (que es User.id) en columnas cuya FK apunta
 * a Profile.id. En producción funciona porque los perfiles se crearon con el id
 * del usuario; si el seed usara ids distintos, toda alta desde la interfaz
 * fallaría con un 500 por violación de clave foránea.
 */
export const P_ADMIN = qaId('user:qa.admin@domotai.test');
export const P_SALES_1 = qaId('user:qa.sales1@domotai.test');
export const P_SALES_2 = qaId('user:qa.sales2@domotai.test');
export const P_FREELANCER = qaId('user:qa.freelancer@domotai.test');
export const P_VIEWER = qaId('user:qa.viewer@domotai.test');
export const P_CLIENT = qaId('user:qa.client@domotai.test');
export const P_BETA_ADMIN = qaId('user:qa.beta@contoso.test');

export const PIPELINE_A = qaId('pipeline:alpha');

export const STAGES = [
    { key: 'nuevo', name: 'Nuevo', color: '#64748b', order: 0, category: 'standard', weight: 10 },
    { key: 'contactado', name: 'Contactado', color: '#0ea5e9', order: 1, category: 'standard', weight: 25 },
    { key: 'propuesta', name: 'Propuesta', color: '#8b5cf6', order: 2, category: 'standard', weight: 50 },
    { key: 'negociacion', name: 'Negociación', color: '#f59e0b', order: 3, category: 'standard', weight: 75 },
    { key: 'ganado', name: 'Ganado', color: '#10b981', order: 4, category: 'won', weight: 100 },
    { key: 'perdido', name: 'Perdido', color: '#ef4444', order: 5, category: 'lost', weight: 0 },
];

interface SeedUser {
    profileId: string;
    email: string;
    fullName: string;
    role: string;
    phone: string;
    orgs: Array<{ orgId: string; memberRole: string }>;
}

export const USERS: SeedUser[] = [
    {
        profileId: P_ADMIN, email: 'qa.admin@domotai.test', fullName: 'Alicia Admin',
        role: 'admin', phone: '+56900000101',
        orgs: [{ orgId: ORG_A, memberRole: 'admin' }],
    },
    {
        profileId: P_SALES_1, email: 'qa.sales1@domotai.test', fullName: 'Sergio Comercial',
        role: 'salesman', phone: '+56900000102',
        orgs: [{ orgId: ORG_A, memberRole: 'member' }],
    },
    {
        // Deliberado: este perfil recibirá SOLO tareas comerciales y cero de
        // proyecto. Reproduce el bug de Capacidad reportado en la reunión:
        // el resumen lo muestra cargado, el detalle por proyecto sale vacío.
        profileId: P_SALES_2, email: 'qa.sales2@domotai.test', fullName: 'Marina Comercial',
        role: 'salesman', phone: '+56900000103',
        orgs: [{ orgId: ORG_A, memberRole: 'member' }],
    },
    {
        profileId: P_FREELANCER, email: 'qa.freelancer@domotai.test', fullName: 'Fabián Freelance',
        role: 'freelancer', phone: '+56900000104',
        orgs: [{ orgId: ORG_A, memberRole: 'member' }],
    },
    {
        profileId: P_VIEWER, email: 'qa.viewer@domotai.test', fullName: 'Valeria Observadora',
        role: 'viewer', phone: '+56900000105',
        orgs: [{ orgId: ORG_A, memberRole: 'member' }],
    },
    {
        profileId: P_CLIENT, email: 'qa.client@domotai.test', fullName: 'Clara Cliente',
        role: 'client', phone: '+56900000106',
        orgs: [{ orgId: ORG_A, memberRole: 'client' }],
    },
    {
        profileId: P_BETA_ADMIN, email: 'qa.beta@contoso.test', fullName: 'Bruno Beta',
        role: 'admin', phone: '+56900000107',
        orgs: [{ orgId: ORG_B, memberRole: 'admin' }],
    },
];

export async function seedCore(prisma: PrismaClient): Promise<void> {
    const hashed = await bcrypt.hash(QA_PASSWORD, 10);

    // ── Organizaciones ──────────────────────────────────────────────────────
    await prisma.organization.upsert({
        where: { id: ORG_A },
        update: { name: 'Domotai QA' },
        create: { id: ORG_A, name: 'Domotai QA', slug: 'domotai-qa', colorScheme: 'purple' },
    });
    await prisma.organization.upsert({
        where: { id: ORG_B },
        update: { name: 'Contoso QA (aislamiento)' },
        create: { id: ORG_B, name: 'Contoso QA (aislamiento)', slug: 'contoso-qa', colorScheme: 'blue' },
    });

    // ── Usuarios, perfiles y membresías ─────────────────────────────────────
    for (const u of USERS) {
        const userId = qaId(`user:${u.email}`);

        await prisma.user.upsert({
            where: { email: u.email },
            update: { password: hashed },
            create: {
                id: userId,
                email: u.email,
                password: hashed,
                firstName: u.fullName.split(' ')[0],
                lastName: u.fullName.split(' ').slice(1).join(' '),
                gender: 'unspecified',
                phoneNumber: u.phone,
                authProvider: 'EMAIL',
                role: u.role === 'admin' ? 'ADMIN' : 'USER',
            },
        });

        await prisma.profile.upsert({
            where: { id: u.profileId },
            update: { role: u.role, currentOrganizationId: u.orgs[0].orgId },
            create: {
                id: u.profileId,
                email: u.email,
                fullName: u.fullName,
                phone: u.phone,
                role: u.role,
                commissionRate: u.role === 'freelancer' ? 12 : 5,
                shouldChangePassword: false,
                currentOrganizationId: u.orgs[0].orgId,
                userId,
            },
        });

        for (const m of u.orgs) {
            const memberId = qaId(`member:${u.email}:${m.orgId}`);
            await prisma.organizationMember.upsert({
                where: { id: memberId },
                update: { role: m.memberRole },
                create: {
                    id: memberId,
                    organizationId: m.orgId,
                    userId: u.profileId, // FK a Profile.id, no a User.id
                    role: m.memberRole,
                },
            });
        }
    }

    await prisma.organization.update({ where: { id: ORG_A }, data: { createdBy: P_ADMIN } });
    await prisma.organization.update({ where: { id: ORG_B }, data: { createdBy: P_BETA_ADMIN } });

    // ── Comodidad: cualquier admin ya existente entra a las orgs de QA ──────
    // Evita tener que cerrar sesión para ver los datos: basta con cambiar de
    // organización en el selector de la interfaz.
    const outsiders = await prisma.profile.findMany({
        where: { role: 'admin', id: { notIn: [P_ADMIN, P_BETA_ADMIN] } },
        select: { id: true, email: true },
    });
    for (const o of outsiders) {
        for (const orgId of [ORG_A, ORG_B]) {
            const memberId = qaId(`member:outsider:${o.id}:${orgId}`);
            const exists = await prisma.organizationMember.findFirst({
                where: { organizationId: orgId, userId: o.id },
            });
            if (!exists) {
                await prisma.organizationMember.create({
                    data: { id: memberId, organizationId: orgId, userId: o.id, role: 'admin' },
                });
            }
        }
    }

    // ── Pipelines ───────────────────────────────────────────────────────────
    await prisma.pipeline.upsert({
        where: { id: PIPELINE_A },
        update: {},
        create: { id: PIPELINE_A, name: 'Pipeline comercial', isDefault: true, organizationId: ORG_A },
    });
    for (const s of STAGES) {
        const stageId = qaId(`stage:${s.key}`);
        await prisma.pipelineStage.upsert({
            where: { id: stageId },
            update: { name: s.name, order: s.order, category: s.category, weight: s.weight },
            create: {
                id: stageId, pipelineId: PIPELINE_A, name: s.name, slug: s.key,
                color: s.color, order: s.order, category: s.category, weight: s.weight,
            },
        });
    }

    // Pipeline mínimo en la org B, para que su tablero no reviente
    const pipelineB = qaId('pipeline:beta');
    await prisma.pipeline.upsert({
        where: { id: pipelineB },
        update: {},
        create: { id: pipelineB, name: 'Pipeline Contoso', isDefault: true, organizationId: ORG_B },
    });
    for (const s of STAGES.slice(0, 3)) {
        const stageId = qaId(`stage:beta:${s.key}`);
        await prisma.pipelineStage.upsert({
            where: { id: stageId },
            update: {},
            create: {
                id: stageId, pipelineId: pipelineB, name: s.name, slug: s.key,
                color: s.color, order: s.order, category: s.category, weight: s.weight,
            },
        });
    }
}
