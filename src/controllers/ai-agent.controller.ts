import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { prisma } from '../config/prisma';
import OpenAI from 'openai';

// Igual que en utils/ai.ts: openai v7 lanza si falta la API key al construir,
// y los imports corren antes de dotenv.config(). Se crea bajo demanda.
let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!client) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            const err = new Error('OPENAI_API_KEY is not configured') as Error & { status?: number };
            err.status = 503;
            throw err;
        }
        client = new OpenAI({ apiKey });
    }
    return client;
}

export const AiAgentController = {
    chat: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');

            const userId = (req as any).userId || (req as any).user?.profileId;
            const { message } = req.body;
            if (!message) return sendError(res, 400, 'message is required');

            // Gather CRM context data in parallel
            const [leadStats, recentLeads, recentTasks, companies, projects, chatHistory] = await Promise.all([
                prisma.lead.groupBy({
                    by: ['stage'],
                    where: { organizationId },
                    _count: true,
                    _sum: { price: true },
                }),
                prisma.lead.findMany({
                    where: { organizationId },
                    orderBy: { updatedAt: 'desc' },
                    take: 10,
                    select: {
                        name: true, stage: true, price: true, nextFollowUp: true,
                        company: { select: { name: true } },
                        contact: { select: { name: true } },
                        assignee: { select: { fullName: true } },
                    },
                }),
                prisma.task.findMany({
                    where: { organizationId, status: { not: 'COMPLETED' } },
                    orderBy: { dueDate: 'asc' },
                    take: 10,
                    select: {
                        title: true, status: true, priority: true, dueDate: true,
                        assignee: { select: { fullName: true } },
                        company: { select: { name: true } },
                    },
                }),
                prisma.company.findMany({
                    where: { organizationId, deletedAt: null },
                    take: 20,
                    select: {
                        name: true, industry: true,
                        _count: { select: { leads: true, contacts: true } },
                    },
                }),
                prisma.project.findMany({
                    where: { organizationId, status: { not: 'ARCHIVED' } },
                    orderBy: { updatedAt: 'desc' },
                    take: 30,
                    select: {
                        name: true, status: true, complexity: true,
                        repos: {
                            select: {
                                label: true, githubOwner: true, repositoryName: true, lastGitSyncAt: true,
                                gitMetrics: {
                                    select: {
                                        branchName: true, lastCommitDate: true, lastCommitMessage: true,
                                        lastCommitAuthor: true, commitsCount: true,
                                    },
                                    orderBy: { lastCommitDate: 'desc' },
                                    take: 2,
                                },
                            },
                        },
                        _count: {
                            select: {
                                tasks: { where: { status: { not: 'COMPLETED' } } },
                            },
                        },
                    },
                }),
                // Load last 10 messages for conversation memory
                userId ? prisma.aiChatMessage.findMany({
                    where: { organizationId, userId },
                    orderBy: { createdAt: 'asc' },
                    take: 10,
                    select: { role: true, content: true },
                }) : Promise.resolve([]),
            ]);

            const formatRelative = (date: Date | null | undefined): string => {
                if (!date) return 'never';
                const ms = Date.now() - new Date(date).getTime();
                const days = Math.floor(ms / (24 * 60 * 60 * 1000));
                if (days === 0) return 'today';
                if (days === 1) return '1d ago';
                if (days < 30) return `${days}d ago`;
                const months = Math.floor(days / 30);
                return `${months}mo ago`;
            };

            const projectsSection = projects.map(p => {
                const baseLine = `- "${p.name}" | Status: ${p.status || 'N/A'} | Complexity: ${p.complexity || 'N/A'} | Open tasks: ${p._count.tasks}`;
                if (!p.repos.length) return baseLine + ' | No repos linked';

                const repoLines = p.repos.map(r => {
                    const labelStr = r.label ? `${r.label} (${r.githubOwner}/${r.repositoryName})` : `${r.githubOwner}/${r.repositoryName}`;
                    const latest = r.gitMetrics[0];
                    const latestStr = latest
                        ? `last commit: "${(latest.lastCommitMessage || '').slice(0, 80)}" by ${latest.lastCommitAuthor || '?'} on ${latest.branchName} (${formatRelative(latest.lastCommitDate)})`
                        : 'no commits synced';
                    return `    • Repo ${labelStr}: ${latestStr}`;
                }).join('\n');

                return `${baseLine}\n${repoLines}`;
            }).join('\n');

            const crmContext = `
## Current CRM Data (Organization)

### Pipeline Summary:
${leadStats.map(s => `- ${s.stage}: ${s._count} leads, $${Number(s._sum.price || 0).toFixed(0)} total`).join('\n')}

### Recent Leads (last 10 updated):
${recentLeads.map(l => `- "${l.name}" | Stage: ${l.stage} | Amount: $${Number(l.price || 0)} | Company: ${l.company?.name || 'N/A'} | Contact: ${l.contact?.name || 'N/A'} | Owner: ${l.assignee?.fullName || 'Unassigned'} | Follow-up: ${l.nextFollowUp || 'Not set'}`).join('\n')}

### Pending Tasks (next 10):
${recentTasks.map(t => `- "${t.title}" | ${t.status} | ${t.priority} | Due: ${t.dueDate || 'No date'} | Owner: ${t.assignee?.fullName || 'Unassigned'} | Company: ${t.company?.name || 'N/A'}`).join('\n')}

### Companies (top 20):
${companies.map(c => `- ${c.name} (${c.industry || 'N/A'}) — ${c._count.leads} leads, ${c._count.contacts} contacts`).join('\n')}

### Active Projects (with GitHub activity):
${projectsSection || '(no active projects)'}
`;

            // Build messages array with history
            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                {
                    role: 'system',
                    content: `You are an operations AI assistant for Domotai CRM. You help the team manage their commercial pipeline (leads, contacts, tasks), AND their delivery projects (status, GitHub activity, open tasks). You have access to real CRM data below.

Respond in Spanish (the team speaks Spanish). Be concise and actionable. When asked about data, reference specific leads, companies, projects, or tasks by name. When asked for a project status, summarize git activity (recent commits, branches), open tasks, and overall progress. Suggest next actions when appropriate.

${crmContext}`,
                },
                // Add conversation history
                ...chatHistory.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
                // Current message
                { role: 'user' as const, content: message },
            ];

            const completion = await getOpenAI().chat.completions.create({
                model: 'gpt-4o-mini',
                messages,
                max_tokens: 1000,
                temperature: 0.7,
            });

            const reply = completion.choices[0]?.message?.content || 'No pude procesar tu solicitud.';

            // Save both messages to conversation history
            if (userId) {
                await prisma.aiChatMessage.createMany({
                    data: [
                        { organizationId, userId, role: 'user', content: message },
                        { organizationId, userId, role: 'assistant', content: reply },
                    ],
                });

                // Keep only last 20 messages per user (trim old ones)
                const count = await prisma.aiChatMessage.count({ where: { organizationId, userId } });
                if (count > 20) {
                    const oldest = await prisma.aiChatMessage.findMany({
                        where: { organizationId, userId },
                        orderBy: { createdAt: 'asc' },
                        take: count - 20,
                        select: { id: true },
                    });
                    await prisma.aiChatMessage.deleteMany({
                        where: { id: { in: oldest.map(m => m.id) } },
                    });
                }
            }

            res.json({ reply, usage: completion.usage });
        } catch (error: any) {
            if (error?.status === 401) {
                return sendError(res, 500, 'OpenAI API key is invalid or missing');
            }
            if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
                return sendError(res, 504, 'AI assistant timed out. Please try again.');
            }
            return sendError(res, 500, 'AI assistant is temporarily unavailable. Please try again.', error);
        }
    },

    clearHistory: async (req: Request, res: Response) => {
        try {
            const organizationId = req.headers['x-organization-id'] as string;
            if (!organizationId) return sendError(res, 400, 'x-organization-id header is required');
            const userId = (req as any).userId || (req as any).user?.profileId;
            if (!userId) return sendError(res, 400, 'User not identified');

            await prisma.aiChatMessage.deleteMany({ where: { organizationId, userId } });
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 500, 'Failed to clear chat history', error);
        }
    },
};
