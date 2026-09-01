#!/usr/bin/env bash
#
# Prueba end-to-end (local) de los avisos por EVENTO (no por fecha): los que ya
# existían y que dependen del mismo camino notify()/emailService → SMTP. Confirma
# que cada acción HTTP entrega su correo en Mailpit, para asegurar el
# comportamiento en producción.
#
#   npm run notifications:demo            # deja los datos de prueba
#   npm run notifications:demo -- --clean # borra los datos de prueba al final
#
# Complemento de `npm run reminders:demo`, que cubre los avisos por FECHA
# (reminderDate, dueDate, endDate, nextFollowUp).
#
# Requisitos: Postgres local, psql, curl, binario mailpit en ~/bin/mailpit.
set -euo pipefail
cd "$(dirname "$0")/.."

MAILPIT_BIN="${MAILPIT_BIN:-$HOME/bin/mailpit}"
SMTP_PORT="${SMTP_PORT:-1025}"
UI_PORT="${MAILPIT_UI_PORT:-8025}"
API_PORT="${API_PORT:-3010}"
API="http://localhost:${API_PORT}"

# IDs fijos de prueba → re-ejecuciones idempotentes / limpiables
TASK_ID="a1a1a1a1-0000-0000-0000-000000000001"
LEAD_ID="a1a1a1a1-0000-0000-0000-000000000002"
PTASK_TITLE="NOTIF projecttask"

DBURL="$(grep -m1 '^DATABASE_URL=' .env | sed 's/DATABASE_URL=//; s/"//g; s/?schema=public//')"
psql_q() { psql "$DBURL" -qtA -c "$1"; }

echo "──────────────────────────────────────────────"
echo "1) Mailpit"
if ! curl -fsS -o /dev/null "http://localhost:${UI_PORT}/" 2>/dev/null; then
    [ -x "$MAILPIT_BIN" ] || { echo "❌ Falta $MAILPIT_BIN"; exit 1; }
    "$MAILPIT_BIN" --smtp "0.0.0.0:${SMTP_PORT}" --listen "0.0.0.0:${UI_PORT}" >/tmp/mailpit.log 2>&1 &
    sleep 2
fi
curl -fsS -X DELETE "http://localhost:${UI_PORT}/api/v1/messages" >/dev/null 2>&1
echo "   Mailpit OK (bandeja limpiada) — UI http://localhost:${UI_PORT}"

echo "2) IDs de prueba (dos perfiles con email de ORG_A + un proyecto/fase)"
ADMIN=$(psql_q "SELECT id FROM profiles WHERE email='qa.admin@domotai.test' LIMIT 1;")
SALES=$(psql_q "SELECT id FROM profiles WHERE email='qa.sales1@domotai.test' LIMIT 1;")
SALES_EMAIL="qa.sales1@domotai.test"
ORG=$(psql_q "SELECT om.\"organizationId\" FROM organization_members om WHERE om.\"userId\"='$ADMIN' LIMIT 1;")
ROW=$(psql_q "SELECT ph.\"projectId\"||'|'||ph.id FROM project_phases ph JOIN projects p ON p.id=ph.\"projectId\" WHERE p.\"organizationId\"='$ORG' LIMIT 1;")
PROJECT="${ROW%%|*}"; PHASE="${ROW#*|}"
echo "   admin=$ADMIN  sales(dest)=$SALES  org=$ORG"
echo "   project=$PROJECT  phase=$PHASE"

echo "3) Servidor temporal :${API_PORT} (SMTP→Mailpit, scheduler de recordatorios OFF)"
if ! curl -fsS -o /dev/null "$API/health" 2>/dev/null; then
    PORT="$API_PORT" REMINDERS_ENABLED=false SMTP_HOST=localhost SMTP_PORT="$SMTP_PORT" SMTP_SECURE=false SMTP_USER= SMTP_PASS= \
        npx ts-node src/server.ts >/tmp/notif-server.log 2>&1 &
    for i in $(seq 1 30); do curl -fsS -o /dev/null "$API/health" 2>/dev/null && break; sleep 1; done
fi
curl -fsS -o /dev/null "$API/health" || { echo "❌ server no respondió"; tail -5 /tmp/notif-server.log; exit 1; }
STARTED_SERVER=1
echo "   listo."

TOK=$(curl -s -X POST "$API/users/login" -H 'Content-Type: application/json' \
    -d '{"email":"qa.admin@domotai.test","password":"QaDomotai2026!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
H=(-H "Authorization: Bearer $TOK" -H "X-Organization-Id: $ORG" -H 'Content-Type: application/json')
code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }

echo "4) Disparar avisos por EVENTO (destinatario = $SALES_EMAIL salvo el comentario)"

# 4a. Tarea de CRM asignada → sendTaskAssigned
printf "   a) POST /tasks (asignada a sales)          -> "
curl -s -X POST "$API/tasks" "${H[@]}" -d "{\"title\":\"NOTIF task asignada\",\"assignedTo\":\"$SALES\"}" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print("id="+d.get("id","?"))' 2>/dev/null || echo "FALLO"
CREATED_TASK=$(psql_q "SELECT id FROM tasks WHERE title='NOTIF task asignada' AND \"organizationId\"='$ORG' ORDER BY \"createdAt\" DESC LIMIT 1;")

# 4b. Comentario en una tarea asignada a sales (comenta admin) → TASK_COMMENT a sales
printf "   b) POST /tasks/:id/comments (a la de sales) -> %s\n" "$(code -X POST "$API/tasks/$CREATED_TASK/comments" "${H[@]}" -d '{"content":"NOTIF comentario"}')"

# 4c. Tarea de PROYECTO asignada → PROJECT_TASK_ASSIGNED
printf "   c) POST /projects/:id/tasks (asignada)      -> %s\n" "$(code -X POST "$API/projects/$PROJECT/tasks" "${H[@]}" -d "{\"title\":\"$PTASK_TITLE\",\"phaseId\":\"$PHASE\",\"assignedTo\":\"$SALES\"}")"
CREATED_PTASK=$(psql_q "SELECT id FROM project_tasks WHERE title='$PTASK_TITLE' AND \"organizationId\"='$ORG' ORDER BY \"createdAt\" DESC LIMIT 1;")

# 4d. Lead creado y asignado a sales → LEAD_ASSIGNED
printf "   d) POST /leads (asignado a sales)           -> "
curl -s -X POST "$API/leads" "${H[@]}" -d "{\"name\":\"NOTIF lead\",\"stage\":\"nuevo\",\"assignedTo\":\"$SALES\"}" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print("id="+d.get("id","?"))' 2>/dev/null || echo "FALLO"
CREATED_LEAD=$(psql_q "SELECT id FROM leads WHERE name='NOTIF lead' AND \"organizationId\"='$ORG' ORDER BY \"createdAt\" DESC LIMIT 1;")

# 4e. Mover ese lead de etapa → LEAD_STAGE_CHANGE a sales  (el aviso que reportó el cliente)
printf "   e) PUT /leads/:id {stage} (cambio etapa)    -> %s\n" "$(code -X PUT "$API/leads/$CREATED_LEAD" "${H[@]}" -d '{"stage":"contactado"}')"

sleep 3  # los correos son fire-and-forget tras responder

echo "5) Correos recibidos en Mailpit"
curl -fsS "http://localhost:${UI_PORT}/api/v1/messages?limit=20" | python3 -c '
import sys, json
d = json.load(sys.stdin)
print("   total:", d["total"])
for m in d["messages"]:
    to = ", ".join(a["Address"] for a in m["To"])
    print("   -", m["Subject"], " -> ", to)
'
echo "   (esperados: task asignada, comentario, project-task asignada, lead asignado, lead movido de etapa)"

if [ "${1:-}" = "--clean" ]; then
    echo "6) Limpieza"
    for id in "$CREATED_TASK" "$CREATED_LEAD"; do [ -n "$id" ] && psql "$DBURL" -q -c "DELETE FROM notifications WHERE \"entityId\"='$id';" >/dev/null; done
    [ -n "$CREATED_PTASK" ] && psql "$DBURL" -q -c "DELETE FROM notifications WHERE \"entityId\"='$CREATED_PTASK';" >/dev/null
    [ -n "$CREATED_TASK" ]  && psql "$DBURL" -q -c "DELETE FROM task_comments WHERE \"taskId\"='$CREATED_TASK'; DELETE FROM tasks WHERE id='$CREATED_TASK';" >/dev/null
    [ -n "$CREATED_PTASK" ] && psql "$DBURL" -q -c "DELETE FROM project_tasks WHERE id='$CREATED_PTASK';" >/dev/null
    [ -n "$CREATED_LEAD" ]  && psql "$DBURL" -q -c "DELETE FROM leads WHERE id='$CREATED_LEAD';" >/dev/null
    echo "   datos de prueba borrados."
fi

echo "7) Detener servidor temporal"
pkill -f "ts-node src/server.ts" 2>/dev/null || true
echo "──────────────────────────────────────────────"
echo "✅ Revisa los correos en http://localhost:${UI_PORT}"
