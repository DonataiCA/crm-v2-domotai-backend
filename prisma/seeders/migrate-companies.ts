import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const contacts = await prisma.contact.findMany({
        where: { company: { not: null }, deletedAt: null },
        select: { id: true, company: true, organizationId: true },
    });

    const companyMap = new Map<string, string>();

    for (const contact of contacts) {
        if (!contact.company?.trim()) continue;

        const key = `${contact.organizationId}::${contact.company.trim()}`;

        if (!companyMap.has(key)) {
            const existing = await prisma.company.findFirst({
                where: { name: contact.company.trim(), organizationId: contact.organizationId },
            });

            if (existing) {
                companyMap.set(key, existing.id);
            } else {
                const company = await prisma.company.create({
                    data: {
                        name: contact.company.trim(),
                        organizationId: contact.organizationId,
                    },
                });
                companyMap.set(key, company.id);
                console.log(`Created company: ${company.name}`);
            }
        }

        await prisma.contact.update({
            where: { id: contact.id },
            data: { companyId: companyMap.get(key) },
        });
    }

    console.log(`Migrated ${companyMap.size} companies from ${contacts.length} contacts`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
