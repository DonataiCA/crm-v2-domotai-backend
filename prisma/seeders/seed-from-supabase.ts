import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const SEED_DIR = path.join(__dirname, '..', 'seed-data');
const DEFAULT_PASSWORD = 'Domotai2026';

function loadJson(file: string): any[] {
  const filePath = path.join(SEED_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) return [];
  return data;
}

function toDate(val: any): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  console.log('🌱 Starting seed from Supabase data...\n');

  // ── 1. Hash default password ──────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  console.log(`Default password "${DEFAULT_PASSWORD}" hashed.`);

  // ── 2. Profiles → User + Profile ─────────────────────────────────────────
  const profiles = loadJson('profiles.json');
  console.log(`\nSeeding ${profiles.length} profiles...`);

  for (const p of profiles) {
    const nameParts = (p.full_name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create auth User
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        id: p.id,
        firstName,
        lastName,
        email: p.email,
        password: hashedPassword,
        phoneNumber: p.phone || `+0000${Date.now()}`,
        gender: 'unspecified',
        authProvider: 'EMAIL',
        role: p.role === 'admin' ? 'ADMIN' : 'USER',
      },
    });

    // Create CRM Profile linked to User
    await prisma.profile.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        email: p.email,
        fullName: p.full_name || '',
        phone: p.phone || '',
        role: p.role || 'salesman',
        commissionRate: p.commission_rate ?? 5.0,
        currentOrganizationId: p.current_organization_id,
        userId: user.id,
        createdAt: toDate(p.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${profiles.length} users + profiles created.`);

  // ── 3. Organizations ──────────────────────────────────────────────────────
  const orgs = loadJson('organizations.json');
  console.log(`\nSeeding ${orgs.length} organizations...`);

  for (const o of orgs) {
    await prisma.organization.upsert({
      where: { id: o.id },
      update: {},
      create: {
        id: o.id,
        name: o.name,
        slug: o.slug,
        logoUrl: o.logo_url,
        colorScheme: o.color_scheme || 'purple',
        createdBy: o.created_by,
        createdAt: toDate(o.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${orgs.length} organizations created.`);

  // ── 4. Organization Members ───────────────────────────────────────────────
  const orgMembers = loadJson('organization_members.json');
  console.log(`\nSeeding ${orgMembers.length} organization members...`);

  for (const m of orgMembers) {
    await prisma.organizationMember.upsert({
      where: { id: m.id },
      update: {},
      create: {
        id: m.id,
        organizationId: m.organization_id,
        userId: m.user_id,
        role: m.role || 'member',
        createdAt: toDate(m.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${orgMembers.length} organization members created.`);

  // ── 5. Contacts ───────────────────────────────────────────────────────────
  const contacts = loadJson('contacts.json');
  console.log(`\nSeeding ${contacts.length} contacts...`);

  for (const c of contacts) {
    await prisma.contact.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        name: c.name || '',
        email: c.email || '',
        phone: c.phone || '',
        company: c.company || '',
        category: c.category || 'prospect',
        role: c.role || '',
        leadSource: c.lead_source || '',
        city: c.city || '',
        country: c.country || '',
        website: c.website || '',
        totalRevenue: c.total_revenue ?? 0,
        assignedTo: c.assigned_to,
        createdBy: c.created_by,
        organizationId: c.organization_id,
        createdAt: toDate(c.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${contacts.length} contacts created.`);

  // ── 6. Contact Notes ──────────────────────────────────────────────────────
  const contactNotes = loadJson('contact_notes.json');
  if (contactNotes.length > 0) {
    console.log(`\nSeeding ${contactNotes.length} contact notes...`);
    for (const n of contactNotes) {
      await prisma.contactNote.upsert({
        where: { id: n.id },
        update: {},
        create: {
          id: n.id,
          contactId: n.contact_id,
          note: n.note || '',
          createdBy: n.created_by,
          createdAt: toDate(n.created_at) || new Date(),
        },
      });
    }
    console.log(`✓ ${contactNotes.length} contact notes created.`);
  }

  // ── 7. File Links ─────────────────────────────────────────────────────────
  const fileLinks = loadJson('file_links.json');
  if (fileLinks.length > 0) {
    console.log(`\nSeeding ${fileLinks.length} file links...`);
    for (const f of fileLinks) {
      await prisma.fileLink.upsert({
        where: { id: f.id },
        update: {},
        create: {
          id: f.id,
          contactId: f.contact_id,
          title: f.title || '',
          url: f.url || '',
          fileType: f.file_type,
          createdBy: f.created_by,
          createdAt: toDate(f.created_at) || new Date(),
        },
      });
    }
    console.log(`✓ ${fileLinks.length} file links created.`);
  }

  // ── 8. Projects ───────────────────────────────────────────────────────────
  const projects = loadJson('projects.json');
  console.log(`\nSeeding ${projects.length} projects...`);

  for (const p of projects) {
    await prisma.project.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        name: p.name || '',
        description: p.description || '',
        status: p.status || 'Not Started',
        complexity: p.complexity,
        price: p.price ?? 0,
        pricingType: p.pricing_type || 'flat',
        revenue: p.revenue ?? 0,
        paymentDate: toDate(p.payment_date),
        recurringStartDate: toDate(p.recurring_start_date),
        recurringEndDate: toDate(p.recurring_end_date),
        commissionPaid: p.commission_paid ?? false,
        totalHours: p.total_hours ?? 0,
        prd: p.prd,
        startDate: toDate(p.start_date),
        endDate: toDate(p.end_date),
        repositoryUrl: p.repository_url,
        repositoryName: p.repository_name,
        githubOwner: p.github_owner,
        defaultBranch: p.default_branch || 'main',
        productionUrl: p.production_url,
        monitorApiKey: p.monitor_api_key,
        projectLeadId: p.project_lead_id,
        createdBy: p.created_by,
        organizationId: p.organization_id,
        createdAt: toDate(p.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${projects.length} projects created.`);

  // ── 9. Leads (after projects & contacts) ──────────────────────────────────
  const leads = loadJson('leads.json');
  console.log(`\nSeeding ${leads.length} leads...`);

  for (const l of leads) {
    await prisma.lead.upsert({
      where: { id: l.id },
      update: {},
      create: {
        id: l.id,
        name: l.name,
        details: l.details,
        stage: l.stage || 'new',
        pipelineId: l.pipeline_id,
        price: l.price ?? 0,
        pricingType: l.pricing_type || 'flat',
        paymentDate: toDate(l.payment_date),
        recurringStartDate: toDate(l.recurring_start_date),
        recurringEndDate: toDate(l.recurring_end_date),
        nextFollowUp: toDate(l.next_follow_up),
        converted: l.converted ?? false,
        convertedAt: toDate(l.converted_at),
        contactId: l.contact_id,
        projectId: l.project_id,
        assignedTo: l.assigned_to,
        createdBy: l.created_by,
        organizationId: l.organization_id,
        createdAt: toDate(l.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${leads.length} leads created.`);

  // ── 10. Lead Events ───────────────────────────────────────────────────────
  const leadEvents = loadJson('lead_events.json');
  console.log(`\nSeeding ${leadEvents.length} lead events...`);

  for (const e of leadEvents) {
    await prisma.leadEvent.upsert({
      where: { id: e.id },
      update: {},
      create: {
        id: e.id,
        leadId: e.lead_id,
        organizationId: e.organization_id,
        eventType: e.event_type || '',
        description: e.description,
        createdBy: e.created_by,
        createdAt: toDate(e.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${leadEvents.length} lead events created.`);

  // ── 11. Lead Stage History ────────────────────────────────────────────────
  const stageHistory = loadJson('lead_stage_history.json');
  console.log(`\nSeeding ${stageHistory.length} lead stage history records...`);

  for (const s of stageHistory) {
    await prisma.leadStageHistory.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        leadId: s.lead_id,
        stage: s.stage || '',
        enteredAt: toDate(s.entered_at) || new Date(),
        exitedAt: toDate(s.exited_at),
        durationSeconds: s.duration_seconds,
        createdBy: s.created_by,
      },
    });
  }
  console.log(`✓ ${stageHistory.length} lead stage history records created.`);

  // ── 12. Project Phases ────────────────────────────────────────────────────
  const phases = loadJson('project_phases.json');
  console.log(`\nSeeding ${phases.length} project phases...`);

  for (const p of phases) {
    await prisma.projectPhase.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        projectId: p.project_id,
        name: p.name || '',
        description: p.description,
        status: p.status || 'pending',
        orderIndex: p.order_index ?? 0,
        startDate: toDate(p.start_date),
        endDate: toDate(p.end_date),
        createdBy: p.created_by,
        createdAt: toDate(p.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${phases.length} project phases created.`);

  // ── 13. Project Tasks ─────────────────────────────────────────────────────
  const projectTasks = loadJson('project_tasks.json');
  console.log(`\nSeeding ${projectTasks.length} project tasks...`);

  for (const t of projectTasks) {
    await prisma.projectTask.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        projectId: t.project_id,
        phaseId: t.phase_id,
        organizationId: t.organization_id,
        title: t.title || '',
        description: t.description,
        status: t.status || 'todo',
        priority: t.priority || 'medium',
        orderIndex: t.order_index ?? 0,
        startDate: toDate(t.start_date),
        dueDate: toDate(t.due_date),
        completedAt: toDate(t.completed_at),
        assignedTo: t.assigned_to,
        createdBy: t.created_by,
        createdByGuest: typeof t.created_by_guest === 'boolean' ? t.created_by_guest : !!t.created_by_guest,
        guestEmail: t.guest_email || (typeof t.created_by_guest === 'string' ? t.created_by_guest : null),
        updatedByGuest: typeof t.updated_by_guest === 'boolean' ? t.updated_by_guest : !!t.updated_by_guest,
        createdAt: toDate(t.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${projectTasks.length} project tasks created.`);

  // ── 14. Project Team Members ──────────────────────────────────────────────
  const teamMembers = loadJson('project_team_members.json');
  console.log(`\nSeeding ${teamMembers.length} project team members...`);

  for (const m of teamMembers) {
    await prisma.projectTeamMember.upsert({
      where: { id: m.id },
      update: {},
      create: {
        id: m.id,
        projectId: m.project_id,
        userId: m.user_id,
        createdAt: toDate(m.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${teamMembers.length} project team members created.`);

  // ── 15. Project Milestones ────────────────────────────────────────────────
  const milestones = loadJson('project_milestones.json');
  if (milestones.length > 0) {
    console.log(`\nSeeding ${milestones.length} project milestones...`);
    for (const m of milestones) {
      await prisma.projectMilestone.upsert({
        where: { id: m.id },
        update: {},
        create: {
          id: m.id,
          projectId: m.project_id,
          title: m.title || '',
          description: m.description,
          dueDate: toDate(m.due_date),
          completed: m.completed ?? false,
          createdAt: toDate(m.created_at) || new Date(),
        },
      });
    }
    console.log(`✓ ${milestones.length} project milestones created.`);
  }

  // ── 16. Tasks (general) ───────────────────────────────────────────────────
  const tasks = loadJson('tasks.json');
  console.log(`\nSeeding ${tasks.length} tasks...`);

  for (const t of tasks) {
    await prisma.task.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        title: t.title || '',
        description: t.description,
        status: t.status || 'todo',
        priority: t.priority || 'medium',
        progress: t.progress ?? 0,
        dueDate: toDate(t.due_date),
        reminderDate: toDate(t.reminder_date),
        assignedTo: t.assigned_to,
        contactId: t.contact_id,
        leadId: t.lead_id,
        projectId: t.project_id,
        createdBy: t.created_by,
        organizationId: t.organization_id,
        createdAt: toDate(t.created_at) || new Date(),
      },
    });
  }
  console.log(`✓ ${tasks.length} tasks created.`);

  // ── 17. Task Comments ─────────────────────────────────────────────────────
  const taskComments = loadJson('task_comments.json');
  if (taskComments.length > 0) {
    console.log(`\nSeeding ${taskComments.length} task comments...`);
    let skippedComments = 0;
    for (const c of taskComments) {
      try {
        await prisma.taskComment.upsert({
          where: { id: c.id },
          update: {},
          create: {
            id: c.id,
            taskId: c.task_id,
            projectTaskId: c.project_task_id,
            organizationId: c.organization_id,
            content: c.content || '',
            createdBy: c.created_by,
            createdByGuest: typeof c.created_by_guest === 'boolean' ? c.created_by_guest : !!c.created_by_guest,
            guestEmail: c.guest_email,
            createdAt: toDate(c.created_at) || new Date(),
          },
        });
      } catch { skippedComments++; }
    }
    console.log(`✓ ${taskComments.length - skippedComments} task comments created (${skippedComments} skipped - FK missing).`);
  }

  // ── 18. Git Metrics ───────────────────────────────────────────────────────
  const gitMetrics = loadJson('git_metrics.json');
  console.log(`\nSeeding ${gitMetrics.length} git metrics...`);

  let skippedGitMetrics = 0;
  for (const g of gitMetrics) {
    try { await prisma.gitMetric.upsert({
      where: { id: g.id },
      update: {},
      create: {
        id: g.id,
        projectId: g.project_id,
        repositoryUrl: g.repository_url,
        branchName: g.branch_name || '',
        commitsCount: g.commits_count ?? 0,
        lastCommitSha: g.last_commit_sha,
        lastCommitDate: toDate(g.last_commit_date),
        lastCommitMessage: g.last_commit_message,
        lastCommitAuthor: g.last_commit_author,
        pullRequestsCount: g.pull_requests_count ?? 0,
        openIssuesCount: g.open_issues_count ?? 0,
        closedIssuesCount: g.closed_issues_count ?? 0,
        organizationId: g.organization_id,
        createdAt: toDate(g.created_at) || new Date(),
      },
    }); } catch { skippedGitMetrics++; }
  }
  console.log(`✓ ${gitMetrics.length - skippedGitMetrics} git metrics created (${skippedGitMetrics} skipped).`);

  // ── 19. Git Commits ───────────────────────────────────────────────────────
  const gitCommits = loadJson('git_commits.json');
  console.log(`\nSeeding ${gitCommits.length} git commits...`);

  let skippedGitCommits = 0;
  for (const c of gitCommits) {
    try { await prisma.gitCommit.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        projectId: c.project_id,
        organizationId: c.organization_id,
        commitSha: c.commit_sha || '',
        commitMessage: c.commit_message,
        commitAuthor: c.commit_author,
        commitDate: toDate(c.commit_date),
        branchName: c.branch_name,
        filesChanged: c.files_changed ?? 0,
        additions: c.additions ?? 0,
        deletions: c.deletions ?? 0,
        repositoryUrl: c.repository_url,
        createdAt: toDate(c.created_at) || new Date(),
      },
    }); } catch { skippedGitCommits++; }
  }
  console.log(`✓ ${gitCommits.length - skippedGitCommits} git commits created (${skippedGitCommits} skipped).`);

  // ── 20. Email Notifications ───────────────────────────────────────────────
  const emailNotifs = loadJson('email_notifications.json');
  console.log(`\nSeeding ${emailNotifs.length} email notifications...`);

  let skippedEmails = 0;
  for (const e of emailNotifs) {
    try { await prisma.emailNotification.upsert({
      where: { id: e.id },
      update: {},
      create: {
        id: e.id,
        taskId: e.task_id,
        projectTaskId: e.project_task_id,
        emailType: e.email_type || 'task_created',
        recipientEmail: e.recipient_email || '',
        sentAt: toDate(e.sent_at) || new Date(),
        success: e.success ?? true,
        errorMessage: e.error_message,
        organizationId: e.organization_id,
        createdAt: toDate(e.created_at) || new Date(),
      },
    }); } catch { skippedEmails++; }
  }
  console.log(`✓ ${emailNotifs.length - skippedEmails} email notifications created (${skippedEmails} skipped).`);

  // ── DONE ──────────────────────────────────────────────────────────────────
  console.log('\n✅ Seed completed successfully!');
  console.log('Default password for all users: ' + DEFAULT_PASSWORD);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
