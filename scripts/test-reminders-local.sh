#!/usr/bin/env bash
#
# Prueba end-to-end (local) de los recordatorios de tareas por correo.
#
#   npm run reminders:demo        # inserta tarea de prueba, dispara el barrido, muestra Mailpit
#   npm run reminders:demo -- --clean   # además borra la tarea de prueba al final
#
# Requisitos: Postgres local (DATABASE_URL del .env), psql, curl, y el binario
# mailpit en ~/bin/mailpit (el script lo arranca solo si no está corriendo).
#
set -euo pipefail
cd "$(dirname "$0")/.."   # raíz del repo backend

MAILPIT_BIN="${MAILPIT_BIN:-$HOME/bin/mailpit}"
SMTP_PORT="${SMTP_PORT:-1025}"
UI_PORT="${MAILPIT_UI_PORT:-8025}"
TASK_ID="aaaaaaaa-1111-2222-3333-444444444444"      # Task (reminderDate)
PROJECT_ID="bbbbbbbb-1111-2222-3333-444444444444"   # Project (endDate)
PTASK_ID="dddddddd-1111-2222-3333-444444444444"     # ProjectTask (dueDate)
# ids fijos → re-ejecuciones resetean las mismas filas

# DATABASE_URL desde el .env, sin el ?schema=public que psql rechaza
DBURL="$(grep -m1 '^DATABASE_URL=' .env | sed 's/DATABASE_URL=//; s/"//g; s/?schema=public//')"
if [ -z "$DBURL" ]; then echo "❌ No encontré DATABASE_URL en .env"; exit 1; fi

psql_q() { psql "$DBURL" -qtA -c "$1"; }

echo "──────────────────────────────────────────────"
echo "1) Mailpit"
if curl -fsS -o /dev/null "http://localhost:${UI_PORT}/" 2>/dev/null; then
    echo "   ya está corriendo (UI http://localhost:${UI_PORT})"
else
    if [ ! -x "$MAILPIT_BIN" ]; then
        echo "❌ No existe $MAILPIT_BIN. Descárgalo con:"
        echo "   curl -fsSL https://github.com/axllent/mailpit/releases/latest/download/mailpit-linux-amd64.tar.gz | tar -xz -C \$HOME/bin mailpit && chmod +x \$HOME/bin/mailpit"
        exit 1
    fi
    echo "   arrancando Mailpit (SMTP :${SMTP_PORT}, UI :${UI_PORT})..."
    "$MAILPIT_BIN" --smtp "0.0.0.0:${SMTP_PORT}" --listen "0.0.0.0:${UI_PORT}" >/tmp/mailpit.log 2>&1 &
    sleep 2
    curl -fsS -o /dev/null "http://localhost:${UI_PORT}/" || { echo "❌ Mailpit no respondió"; exit 1; }
    echo "   listo."
fi

echo "2) Asignado de prueba"
# Un perfil con email que sea miembro de alguna organización (preferimos qa.admin)
ROW="$(psql_q "SELECT p.id||'|'||p.email||'|'||om.\"organizationId\" FROM profiles p JOIN organization_members om ON om.\"userId\"=p.id WHERE p.email='qa.admin@domotai.test' LIMIT 1;")"
if [ -z "$ROW" ]; then
    ROW="$(psql_q "SELECT p.id||'|'||p.email||'|'||om.\"organizationId\" FROM profiles p JOIN organization_members om ON om.\"userId\"=p.id WHERE p.email IS NOT NULL LIMIT 1;")"
fi
if [ -z "$ROW" ]; then echo "❌ No hay ningún perfil con email + membresía. ¿Corriste npm run seed:qa?"; exit 1; fi
PROFILE_ID="${ROW%%|*}"; REST="${ROW#*|}"; EMAIL="${REST%%|*}"; ORG_ID="${REST#*|}"
echo "   → $EMAIL  (profile $PROFILE_ID)"

echo "3) Tarea de prueba (reminderDate vencido, sin marcar)"
psql "$DBURL" -q -c "INSERT INTO tasks (id, title, status, priority, progress, \"reminderDate\", \"assignedTo\", \"organizationId\", \"createdAt\", \"updatedAt\")
VALUES ('$TASK_ID', 'DEMO recordatorio $(date +%H:%M:%S)', 'TODO', 'HIGH', 0, now() - interval '1 minute', '$PROFILE_ID', '$ORG_ID', now(), now())
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, \"reminderDate\"=now()-interval '1 minute', \"reminderSentAt\"=NULL, \"dueReminderSentAt\"=NULL, status='TODO';" >/dev/null
echo "   ok (id $TASK_ID)"

echo "3b) Proyecto de prueba (endDate en ventana, responsable = asignado)"
psql "$DBURL" -q -c "INSERT INTO projects (id, name, status, \"commissionPaid\", \"endDate\", \"projectLeadId\", \"organizationId\", \"createdAt\", \"updatedAt\")
VALUES ('$PROJECT_ID', 'DEMO proyecto $(date +%H:%M:%S)', 'IN_PROGRESS', false, now() + interval '12 hours', '$PROFILE_ID', '$ORG_ID', now(), now())
ON CONFLICT (id) DO UPDATE SET \"endDate\"=now()+interval '12 hours', \"endReminderSentAt\"=NULL, \"projectLeadId\"='$PROFILE_ID', status='IN_PROGRESS';" >/dev/null
echo "   ok (id $PROJECT_ID)"

echo "3c) Tarea de proyecto de prueba (dueDate en ventana, asignada)"
psql "$DBURL" -q -c "INSERT INTO project_tasks (id, \"projectId\", \"organizationId\", title, status, \"orderIndex\", progress, \"createdByGuest\", \"updatedByGuest\", \"dueDate\", \"assignedTo\", \"createdAt\", \"updatedAt\")
VALUES ('$PTASK_ID', '$PROJECT_ID', '$ORG_ID', 'DEMO tarea de proyecto', 'TODO', 0, 0, false, false, now() + interval '12 hours', '$PROFILE_ID', now(), now())
ON CONFLICT (id) DO UPDATE SET \"dueDate\"=now()+interval '12 hours', \"dueReminderSentAt\"=NULL, \"assignedTo\"='$PROFILE_ID', status='TODO';" >/dev/null
echo "   ok (id $PTASK_ID)"

echo "4) Barrido (npm run reminders:once → SMTP a Mailpit)"
SMTP_HOST=localhost SMTP_PORT="$SMTP_PORT" SMTP_SECURE=false SMTP_USER= SMTP_PASS= \
    npm run --silent reminders:once 2>&1 | sed 's/^/   /'

echo "5) Bandeja de Mailpit"
UI_PORT="$UI_PORT" curl -fsS "http://localhost:${UI_PORT}/api/v1/messages?limit=10" | UI_PORT="$UI_PORT" python3 -c '
import sys, json, os
d = json.load(sys.stdin)
port = os.environ.get("UI_PORT", "8025")
print("   total en Mailpit:", d["total"])
for m in d["messages"][:5]:
    to = ", ".join(a["Address"] for a in m["To"])
    print("   -", m["Subject"], " -> ", to)
print("   Abrela en: http://localhost:" + port)
'

if [ "${1:-}" = "--clean" ]; then
    echo "6) Limpieza"
    psql "$DBURL" -q -c "DELETE FROM notifications WHERE \"entityId\" IN ('$TASK_ID','$PROJECT_ID','$PTASK_ID');" >/dev/null
    psql "$DBURL" -q -c "DELETE FROM tasks WHERE id='$TASK_ID';" >/dev/null
    psql "$DBURL" -q -c "DELETE FROM project_tasks WHERE id='$PTASK_ID';" >/dev/null
    psql "$DBURL" -q -c "DELETE FROM projects WHERE id='$PROJECT_ID';" >/dev/null
    echo "   datos de prueba borrados."
fi
echo "──────────────────────────────────────────────"
echo "✅ Listo. Revisa el correo en http://localhost:${UI_PORT}"
