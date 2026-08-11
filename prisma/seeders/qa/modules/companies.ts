import { PrismaClient } from '@prisma/client';
import { qaId } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_SALES_1, P_BETA_ADMIN } from '../core';

export const CO_ANDINA = qaId('company:andina');
export const CO_NORTE = qaId('company:norte');
export const CO_VACIA = qaId('company:vacia');
export const CO_ARCHIVADA = qaId('company:archivada');
export const CO_BETA = qaId('company:beta');

export async function seedCompanies(prisma: PrismaClient): Promise<string> {
    const rows = [
        {
            id: CO_ANDINA, name: 'Constructora Andina', domain: 'andina.test',
            industry: 'Construcción', size: '50-200', website: 'https://andina.test',
            phone: '+56222000101', address: 'Av. Apoquindo 1234, Santiago',
            notes: 'Cliente ancla. Varios proyectos activos.',
            assignedTo: P_SALES_1, deletedAt: null,
        },
        {
            id: CO_NORTE, name: 'Minera Norte Grande', domain: 'norte.test',
            industry: 'Minería', size: '200+', website: 'https://norte.test',
            phone: '+56222000102', address: 'Ruta 5 Norte km 1400, Antofagasta',
            notes: 'Ciclo de compra largo, requiere licitación.',
            assignedTo: P_ADMIN, deletedAt: null,
        },
        {
            // Caso límite: empresa sin contactos, sin leads y sin tareas.
            id: CO_VACIA, name: 'Retail Sur (sin actividad)', domain: null,
            industry: 'Retail', size: '10-50', website: null,
            phone: null, address: null, notes: null,
            assignedTo: null, deletedAt: null,
        },
        {
            // Caso límite: borrado lógico. No debe aparecer en el listado normal.
            id: CO_ARCHIVADA, name: 'Logística Pacífico (archivada)', domain: 'pacifico.test',
            industry: 'Logística', size: '10-50', website: null,
            phone: '+56222000104', address: null, notes: 'Archivada para probar el filtro deletedAt.',
            assignedTo: P_SALES_1, deletedAt: new Date(),
        },
    ];

    for (const r of rows) {
        await prisma.company.upsert({
            where: { id: r.id },
            update: { name: r.name, deletedAt: r.deletedAt },
            create: { ...r, createdBy: P_ADMIN, organizationId: ORG_A },
        });
    }

    // Espejo en la organización B: existe solo para que QA intente leerla con
    // un token de la organización A y verifique que responde 403, no 200.
    await prisma.company.upsert({
        where: { id: CO_BETA },
        update: {},
        create: {
            id: CO_BETA, name: 'Contoso Industrial (org B)', industry: 'Manufactura',
            createdBy: P_BETA_ADMIN, assignedTo: P_BETA_ADMIN, organizationId: ORG_B,
        },
    });

    return `${rows.length} en org A (1 archivada, 1 sin actividad) + 1 en org B`;
}
