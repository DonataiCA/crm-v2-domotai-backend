#!/bin/bash

set -a
source .env
set +a

regex='postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+)'
if [[ $DATABASE_URL =~ $regex ]]; then
  DB_USER="${BASH_REMATCH[1]}"
  DB_PASS="${BASH_REMATCH[2]}"
  DB_HOST="${BASH_REMATCH[3]}"
  DB_PORT="${BASH_REMATCH[4]}"
  DB_NAME="${BASH_REMATCH[5]}"
else
  echo "❌ Error: DATABASE_URL inválida"
  exit 1
fi

echo "🚀 Creando base de datos '$DB_NAME' en $DB_HOST:$DB_PORT..."

export PGPASSWORD=$DB_PASS

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE \"$DB_NAME\""

if [ $? -eq 0 ]; then
  echo "✅ Base de datos '$DB_NAME' creada (o ya existe)."
else
  echo "❌ Error al crear la base de datos."
  exit 1
fi

