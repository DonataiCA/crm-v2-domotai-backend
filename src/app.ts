import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import userRoutes from './routes/user.routes';
import mediaRoutes from './routes/media.routes';
import queueRoutes from './routes/queue.routes';
import organizationRoutes from './routes/organization.routes';
import leadRoutes from './routes/lead.routes';
import pipelineRoutes from './routes/pipeline.routes';
import taskRoutes from './routes/task.routes';
import notificationRoutes from './routes/notification.routes';
import analyticsRoutes from './routes/analytics.routes';
import contactRoutes from './routes/contact.routes';
import companyRoutes from './routes/company.routes';
import projectRoutes from './routes/project.routes';
import portalRoutes from './routes/portal.routes';
import calendarRoutes from './routes/calendar.routes';
import capacityRoutes from './routes/capacity.routes';
import incidentRoutes from './routes/incident.routes';
import invoiceRoutes from './routes/invoice.routes';
import collectionRoutes from './routes/collection.routes';
import subscriptionRoutes from './routes/subscription.routes';
import timeEntryRoutes from './routes/time-entry.routes';
import financialRoutes from './routes/financial.routes';
import auditLogRoutes from './routes/audit-log.routes';
import exportRoutes from './routes/export.routes';
import aiAgentRoutes from './routes/ai-agent.routes';
import dashboardRoutes from './routes/dashboard.routes';
import tagRoutes from './routes/tag.routes';
import dotenv from 'dotenv';
import { ProjectMonitorController } from './controllers/project-monitor.controller';
import { errorHandler } from './middlewares/error.middleware';
import { pm2Logger } from './utils/logger';
import { prisma } from './config/prisma';

dotenv.config();

const app = express();

// Trust first proxy (nginx) so rate limiter uses real client IP
app.set('trust proxy', 1);

// Middleware to save the raw body
interface RequestWithRawBody extends express.Request {
    rawBody?: Buffer;
}

app.use(express.json({
    limit: '50mb', // Increased to 50MB to allow large base64 images
    verify: (req, res, buf) => {
        (req as RequestWithRawBody).rawBody = buf;
    },
}));
app.use(cors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:8080', 'http://localhost:5173'],
    credentials: true,
}));
app.use(helmet());

// Global rate limiter: 200 requests per minute per IP
const globalLimiter = rateLimit({
    windowMs: 60_000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
});
app.use(globalLimiter);

// Strict limiter for auth endpoints: 10 attempts per 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    message: { error: 'Too many login attempts, please try again later' },
});
app.use('/users/login', authLimiter);
app.use('/portal/client-login', authLimiter);

// Convert Prisma Decimal string values to numbers in JSON responses
// Prisma serializes Decimal as string. This replacer converts numeric strings
// for known decimal fields back to numbers.
const DECIMAL_FIELDS = new Set([
    'price', 'revenue', 'totalRevenue', 'totalHours', 'commissionRate',
    'hourlyRate', 'subtotal', 'tax', 'total', 'quantity', 'unitPrice',
]);
app.set('json replacer', (key: string, value: unknown) => {
    if (DECIMAL_FIELDS.has(key) && typeof value === 'string') {
        const n = Number(value);
        return isNaN(n) ? value : n;
    }
    return value;
});

// Global handler for preflight OPTIONS (CORS)
app.options('*', cors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:8080', 'http://localhost:5173'],
    credentials: true,
}));

// Logging middleware - logs all incoming requests
app.use((req, res, next) => {
    const method = req.method;
    const url = req.originalUrl || req.url;
    const userAgent = req.get('User-Agent') || 'Unknown';
    const ip = req.ip || req.connection.remoteAddress || 'Unknown';

    // Log with PM2 format
    pm2Logger.info(`${method} ${url} - IP: ${ip} - User-Agent: ${userAgent}`);

    next();
});

app.get('/health', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
    } catch {
        res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
    }
});

// Monitor ingest (PUBLIC — authenticated by API key, no JWT needed)
app.post('/monitor/:apiKey/ingest', ProjectMonitorController.ingest);

// User routes (includes authentication)
app.use('/users', userRoutes);

// Media routes (files)
app.use('/media', mediaRoutes);

// Queue routes (Bull jobs)
app.use('/queue', queueRoutes);

// Organization routes
app.use('/organizations', organizationRoutes);

// Lead routes
app.use('/leads', leadRoutes);

// Pipeline routes
app.use('/pipelines', pipelineRoutes);

// Task routes
app.use('/tasks', taskRoutes);

// Notification routes
app.use('/notifications', notificationRoutes);

// Analytics routes
app.use('/analytics', analyticsRoutes);

// Contact routes
app.use('/contacts', contactRoutes);

// Company routes
app.use('/companies', companyRoutes);

// Project routes
app.use('/projects', projectRoutes);

// Portal routes
app.use('/portal', portalRoutes);

// Calendar routes
app.use('/calendar', calendarRoutes);

// Capacity routes
app.use('/capacity', capacityRoutes);

// Incident routes
app.use('/incidents', incidentRoutes);

// Invoice routes
app.use('/invoices', invoiceRoutes);
app.use('/collections', collectionRoutes);
app.use('/subscriptions', subscriptionRoutes);

// Time entry routes
app.use('/time-entries', timeEntryRoutes);

// Financial routes
app.use('/financial', financialRoutes);

// Audit log routes
app.use('/audit-logs', auditLogRoutes);

// Export routes
app.use('/export', exportRoutes);

// AI agent routes
app.use('/ai-agent', aiAgentRoutes);

// Dashboard routes
app.use('/dashboard', dashboardRoutes);
app.use('/tags', tagRoutes);

app.use(errorHandler);

export default app;

