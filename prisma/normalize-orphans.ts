/**
 * One-time normalization script for orphan entities.
 * Run: npx tsx prisma/normalize-orphans.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DomotaiCRM Entity Normalization ===\n');

  // 1. Link tasks → companies via contact's companyId
  const tasksViaContact = await prisma.$executeRaw`
    UPDATE tasks t
    SET "companyId" = c."companyId"
    FROM contacts c
    WHERE t."contactId" = c.id
      AND t."companyId" IS NULL
      AND c."companyId" IS NOT NULL
  `;
  console.log(`[1] Tasks linked to companies via contact: ${tasksViaContact}`);

  // 2. Link tasks → companies via lead's companyId
  const tasksViaLead = await prisma.$executeRaw`
    UPDATE tasks t
    SET "companyId" = l."companyId"
    FROM leads l
    WHERE t."leadId" = l.id
      AND t."companyId" IS NULL
      AND l."companyId" IS NOT NULL
  `;
  console.log(`[2] Tasks linked to companies via lead: ${tasksViaLead}`);

  // 3. Link leads → companies via contact's companyId
  const leadsViaContact = await prisma.$executeRaw`
    UPDATE leads l
    SET "companyId" = c."companyId"
    FROM contacts c
    WHERE l."contactId" = c.id
      AND l."companyId" IS NULL
      AND c."companyId" IS NOT NULL
  `;
  console.log(`[3] Leads linked to companies via contact: ${leadsViaContact}`);

  // 4. Assign unassigned companies to org creator
  const unassignedCompanies = await prisma.company.findMany({
    where: { assignedTo: null },
    select: { id: true, organizationId: true },
  });

  let companiesAssigned = 0;
  for (const company of unassignedCompanies) {
    // Find the org's first member (owner/admin)
    const orgMember = await prisma.organizationMember.findFirst({
      where: { organizationId: company.organizationId },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });

    if (orgMember) {
      // Find profile for that user
      const user = await prisma.user.findUnique({ where: { id: orgMember.userId }, select: { email: true } });
      const profile = user ? await prisma.profile.findFirst({
        where: { email: user.email },
        select: { id: true },
      }) : null;

      if (profile) {
        await prisma.company.update({
          where: { id: company.id },
          data: { assignedTo: profile.id },
        });
        companiesAssigned++;
      }
    }
  }
  console.log(`[4] Companies assigned to org member: ${companiesAssigned} (of ${unassignedCompanies.length} unassigned)`);

  // 5. Set stage categories for existing data
  const allStages = await prisma.pipelineStage.findMany();
  let wonSet = 0, lostSet = 0;

  for (const stage of allStages) {
    const nameLower = stage.name.toLowerCase();
    if (['closed won', 'won', 'ganado', 'cerrado ganado'].includes(nameLower)) {
      await prisma.pipelineStage.update({
        where: { id: stage.id },
        data: { category: 'won', weight: 100 },
      });
      wonSet++;
    } else if (['closed lost', 'lost', 'perdido', 'cerrado perdido'].includes(nameLower)) {
      await prisma.pipelineStage.update({
        where: { id: stage.id },
        data: { category: 'lost', weight: 0 },
      });
      lostSet++;
    }
    // "standard" with weight 50 is already the default
  }
  console.log(`[5] Stages categorized: ${wonSet} won, ${lostSet} lost, ${allStages.length - wonSet - lostSet} standard`);

  // Summary
  const remainingOrphanTasks = await prisma.task.count({ where: { companyId: null, contactId: { not: null } } });
  const remainingOrphanLeads = await prisma.lead.count({ where: { companyId: null, contactId: { not: null } } });
  const remainingUnassigned = await prisma.company.count({ where: { assignedTo: null } });

  console.log('\n=== Remaining Issues (may need manual review) ===');
  console.log(`Tasks with contact but no company: ${remainingOrphanTasks}`);
  console.log(`Leads with contact but no company: ${remainingOrphanLeads}`);
  console.log(`Companies without assignee: ${remainingUnassigned}`);
  console.log('\nDone.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
