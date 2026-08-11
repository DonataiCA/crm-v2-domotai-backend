import { PrismaClient } from '@prisma/client';
import { qaId, daysAgo } from '../ids';
import { ORG_A, ORG_B, P_ADMIN, P_SALES_1, P_SALES_2, P_BETA_ADMIN } from '../core';
import { CO_ANDINA, CO_NORTE, CO_BETA } from './companies';

export const CT_ROJAS = qaId('contact:rojas');
export const CT_MENA = qaId('contact:mena');
export const CT_SIN_EMAIL = qaId('contact:sin-email');
export const CT_ARCHIVADO = qaId('contact:archivado');
export const CT_BETA = qaId('contact:beta');

export async function seedContacts(prisma: PrismaClient): Promise<string> {
    const rows = [
        {
            id: CT_ROJAS, name: 'Patricia Rojas', email: 'p.rojas@andina.test',
            phone: '+56911100201', company: 'Constructora Andina', companyId: CO_ANDINA,
            category: 'client', role: 'Gerente de Operaciones', leadSource: 'Referido',
            city: 'Santiago', country: 'Chile', website: 'https://andina.test',
            totalRevenue: 48500, assignedTo: P_SALES_1, deletedAt: null,
        },
        {
            id: CT_MENA, name: 'Ignacio Mena', email: 'i.mena@norte.test',
            phone: '+56911100202', company: 'Minera Norte Grande', companyId: CO_NORTE,
            category: 'prospect', role: 'Jefe de Proyectos', leadSource: 'LinkedIn',
            city: 'Antofagasta', country: 'Chile', website: null,
            totalRevenue: 0, assignedTo: P_SALES_2, deletedAt: null,
        },
        {
            // Caso límite: sin email ni teléfono. Los envíos por correo y las
            // facturas asociadas deben degradar con elegancia, no romper.
            id: CT_SIN_EMAIL, name: 'Contacto Sin Datos', email: '', phone: '',
            company: '', companyId: null, category: 'prospect', role: '',
            leadSource: '', city: '', country: '', website: '',
            totalRevenue: 0, assignedTo: null, deletedAt: null,
        },
        {
            // Caso límite: archivado. Solo debe salir en /contacts/archived.
            id: CT_ARCHIVADO, name: 'Rodrigo Antiguo (archivado)', email: 'r.antiguo@pacifico.test',
            phone: '+56911100204', company: 'Logística Pacífico', companyId: null,
            category: 'lost', role: 'Comprador', leadSource: 'Feria',
            city: 'Valparaíso', country: 'Chile', website: null,
            totalRevenue: 1200, assignedTo: P_SALES_1, deletedAt: daysAgo(20),
        },
    ];

    for (const r of rows) {
        await prisma.contact.upsert({
            where: { id: r.id },
            update: { name: r.name, deletedAt: r.deletedAt },
            create: { ...r, createdBy: P_ADMIN, organizationId: ORG_A },
        });
    }

    await prisma.contact.upsert({
        where: { id: CT_BETA },
        update: {},
        create: {
            id: CT_BETA, name: 'Contacto Contoso (org B)', email: 'contacto@contoso.test',
            companyId: CO_BETA, category: 'client', createdBy: P_BETA_ADMIN,
            assignedTo: P_BETA_ADMIN, organizationId: ORG_B,
        },
    });

    // ── Notas ───────────────────────────────────────────────────────────────
    const notes = [
        { id: qaId('note:rojas-1'), contactId: CT_ROJAS, note: 'Pide propuesta con desglose de horas por fase.', createdBy: P_SALES_1 },
        { id: qaId('note:rojas-2'), contactId: CT_ROJAS, note: 'Confirmó presupuesto aprobado para el Q3.', createdBy: P_ADMIN },
        { id: qaId('note:mena-1'), contactId: CT_MENA, note: 'Requiere pasar por licitación interna. Plazo: 6 semanas.', createdBy: P_SALES_2 },
    ];
    for (const n of notes) {
        await prisma.contactNote.upsert({ where: { id: n.id }, update: {}, create: n });
    }

    // ── Adjuntos (enlaces) ──────────────────────────────────────────────────
    const files = [
        { id: qaId('file:rojas-nda'), contactId: CT_ROJAS, title: 'NDA firmado.pdf', url: 'https://example.test/nda-andina.pdf', fileType: 'pdf', createdBy: P_SALES_1 },
        { id: qaId('file:mena-brief'), contactId: CT_MENA, title: 'Brief técnico.docx', url: 'https://example.test/brief-norte.docx', fileType: 'docx', createdBy: P_SALES_2 },
    ];
    for (const f of files) {
        await prisma.fileLink.upsert({ where: { id: f.id }, update: {}, create: f });
    }

    return `${rows.length} en org A (1 archivado, 1 sin email) + 1 en org B · ${notes.length} notas · ${files.length} adjuntos`;
}
