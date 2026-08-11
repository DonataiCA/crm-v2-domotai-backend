import { PrismaClient } from '@prisma/client';
import { qaId } from '../ids';
import { PR_PORTAL } from './projects';

/**
 * Monitoreo de aplicaciones. La API key es fija para poder probar la ingesta
 * pública sin pasar por la UI:
 *
 *   curl -X POST http://localhost:3000/monitor/qa-monitor-key-portal/ingest \
 *        -H 'Content-Type: application/json' \
 *        -d '{"type":"heartbeat","payload":{"cpu":12,"memoryUsedMB":512}}'
 *
 * Siembra 48 horas de health checks con una caída en medio, para que las
 * gráficas de uptime tengan una discontinuidad visible en lugar de una línea
 * plana perfecta.
 */
export const MONITOR_KEY = 'qa-monitor-key-portal';

export async function seedMonitor(prisma: PrismaClient): Promise<string> {
    await prisma.project.update({
        where: { id: PR_PORTAL },
        data: { monitorApiKey: MONITOR_KEY, productionUrl: 'https://portal-andina.test' },
    });

    const ahora = Date.now();
    const HORA = 3600000;

    // ── Health checks: 48 lecturas horarias, caída entre la 20 y la 24 ──────
    let caidos = 0;
    for (let i = 47; i >= 0; i--) {
        const checkedAt = new Date(ahora - i * HORA);
        const enCaida = i <= 24 && i >= 20;
        if (enCaida) caidos++;
        await prisma.healthCheck.upsert({
            where: { id: qaId(`health:${i}`) },
            update: { checkedAt },
            create: {
                id: qaId(`health:${i}`), projectId: PR_PORTAL,
                statusCode: enCaida ? 502 : 200,
                responseTimeMs: enCaida ? null : 120 + Math.round(Math.sin(i) * 40 + 60),
                isUp: !enCaida,
                errorMessage: enCaida ? 'Bad Gateway: upstream no responde' : null,
                checkedAt,
            },
        });
    }

    // ── Heartbeats: 24 lecturas con CPU y memoria variables ─────────────────
    for (let i = 23; i >= 0; i--) {
        const receivedAt = new Date(ahora - i * HORA);
        await prisma.monitorEvent.upsert({
            where: { id: qaId(`monitor:hb:${i}`) },
            update: { receivedAt },
            create: {
                id: qaId(`monitor:hb:${i}`), projectId: PR_PORTAL, type: 'heartbeat',
                receivedAt,
                payload: {
                    cpu: Math.round((35 + Math.sin(i / 3) * 25) * 100) / 100,
                    memoryUsedMB: 900 + Math.round(Math.cos(i / 4) * 180),
                    memoryTotalMB: 2048,
                    uptimeSeconds: (48 - i) * 3600,
                    version: '1.4.2',
                    nodeVersion: 'v24.19.0',
                    productionUrl: 'https://portal-andina.test',
                },
            },
        });
    }

    // ── Errores ─────────────────────────────────────────────────────────────
    const errores = [
        { key: 'e1', h: 22, statusCode: 502, message: 'ECONNREFUSED al conectar con la base de datos', endpoint: '/api/obras', method: 'GET' },
        { key: 'e2', h: 21, statusCode: 500, message: "TypeError: Cannot read properties of undefined (reading 'id')", endpoint: '/api/obras/:id/avance', method: 'GET' },
        { key: 'e3', h: 20, statusCode: 502, message: 'ECONNREFUSED al conectar con la base de datos', endpoint: '/api/documentos', method: 'GET' },
        { key: 'e4', h: 6, statusCode: 404, message: 'Documento no encontrado', endpoint: '/api/documentos/9f2', method: 'GET' },
        { key: 'e5', h: 2, statusCode: 500, message: 'Timeout al generar el PDF de avance', endpoint: '/api/reportes/pdf', method: 'POST' },
    ];
    for (const e of errores) {
        await prisma.monitorEvent.upsert({
            where: { id: qaId(`monitor:err:${e.key}`) },
            update: {},
            create: {
                id: qaId(`monitor:err:${e.key}`), projectId: PR_PORTAL, type: 'error',
                receivedAt: new Date(ahora - e.h * HORA),
                payload: {
                    statusCode: e.statusCode, message: e.message,
                    endpoint: e.endpoint, method: e.method,
                    source: 'expressMiddleware',
                    stack: `Error: ${e.message}\n    at handler (/app/dist/routes.js:142:11)`,
                },
            },
        });
    }

    // ── Deploys ─────────────────────────────────────────────────────────────
    const deploys = [
        { key: 'd1', h: 30, version: '1.4.0', sha: 'a1b2c3d' },
        { key: 'd2', h: 19, version: '1.4.1', sha: 'e4f5a6b' },
        { key: 'd3', h: 4, version: '1.4.2', sha: 'c7d8e9f' },
    ];
    for (const d of deploys) {
        await prisma.monitorEvent.upsert({
            where: { id: qaId(`monitor:dep:${d.key}`) },
            update: {},
            create: {
                id: qaId(`monitor:dep:${d.key}`), projectId: PR_PORTAL, type: 'deploy',
                receivedAt: new Date(ahora - d.h * HORA),
                payload: { version: d.version, environment: 'production', commitSha: d.sha },
            },
        });
    }

    return `48 health checks (${caidos} caídos, incidencia de 5 h) · 24 heartbeats · ${errores.length} errores · ${deploys.length} deploys · API key: ${MONITOR_KEY}`;
}
