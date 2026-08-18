import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller';
import { ProjectMonitorController } from '../controllers/project-monitor.controller';
import { authenticate, requireOrgMembership } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createProjectSchema, updateProjectSchema, createPhaseSchema, createProjectTaskSchema, chatTaskSchema, importTasksSchema } from '../validators/project.validator';

const router = Router();

router.use(authenticate, requireOrgMembership);

// Static routes MUST come before parameterized routes
router.get('/archived', ProjectController.archived);
router.get('/monitor/overview', ProjectMonitorController.overview);

// CRUD
router.get('/', ProjectController.index);
router.post('/', validate(createProjectSchema), ProjectController.create);
router.get('/:id', ProjectController.show);
router.put('/:id', validate(updateProjectSchema), ProjectController.update);
router.delete('/:id', ProjectController.delete);

// Archive / Restore
router.patch('/:id/archive', ProjectController.archive);
router.patch('/:id/restore', ProjectController.restore);

// Project Contacts
router.put('/:projectId/contacts', ProjectController.setContacts);

// Tracking
router.get('/:id/tracking', ProjectController.tracking);

// AI Task Generation
router.post('/:projectId/generate-tasks', ProjectController.generateTasks);
router.post('/:projectId/chat-task', validate(chatTaskSchema), ProjectController.chatTask);

// Alta de tareas desde la plantilla Markdown. Sin IA: la lee `parseTaskTemplate`.
router.post('/:projectId/import-tasks', validate(importTasksSchema), ProjectController.importTasks);

// Phases
router.post('/:projectId/phases', validate(createPhaseSchema), ProjectController.createPhase);
router.put('/phases/:phaseId', ProjectController.updatePhase);
router.delete('/phases/:phaseId', ProjectController.deletePhase);

// Project Tasks
router.post('/:projectId/tasks', validate(createProjectTaskSchema), ProjectController.createTask);
router.put('/project-tasks/:taskId', ProjectController.updateTask);
router.delete('/project-tasks/:taskId', ProjectController.deleteTask);

// Project Task Comments
router.post('/project-tasks/:taskId/comments', ProjectController.addTaskComment);
router.delete('/project-tasks/comments/:commentId', ProjectController.deleteTaskComment);

// Team Members
router.get('/:projectId/members', ProjectController.getMembers);
router.post('/:projectId/members', ProjectController.addMember);
router.delete('/:projectId/members/:userId', ProjectController.removeMember);

// GitHub Integration — multi-repo CRUD
router.get('/:projectId/repos', ProjectController.listRepos);
router.post('/:projectId/repos', ProjectController.addRepo);
router.put('/:projectId/repos/:repoId', ProjectController.updateRepo);
router.delete('/:projectId/repos/:repoId', ProjectController.deleteRepo);
router.post('/:projectId/repos/:repoId/sync', ProjectController.syncRepo);

// GitHub Integration — legacy + aggregate endpoints (still used by UI)
router.post('/:projectId/github/fetch', ProjectController.githubFetch);
router.get('/:projectId/github/metrics', ProjectController.githubMetrics);
router.get('/:projectId/github/commits', ProjectController.githubCommits);

// Monitor
router.get('/:projectId/monitor/status', ProjectMonitorController.status);
router.get('/:projectId/monitor/events', ProjectMonitorController.events);
router.get('/:projectId/monitor/health-checks', ProjectMonitorController.healthChecks);
router.get('/:projectId/monitor/metrics', ProjectMonitorController.metrics);
router.post('/:projectId/monitor/generate-key', ProjectMonitorController.generateKey);

export default router;
