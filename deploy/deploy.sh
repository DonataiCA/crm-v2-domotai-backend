#!/bin/bash
# ============================================================================
# DomotaiCRM — Deploy/Update script
# Usage: ./deploy.sh <SERVER_IP> <DOMAIN> [SSH_KEY_PATH]
# Example: ./deploy.sh 54.123.45.67 crm.domotai.online ~/.ssh/domotai.pem
# ============================================================================
set -euo pipefail

SERVER_IP="${1:?Usage: ./deploy.sh <SERVER_IP> <DOMAIN> [SSH_KEY_PATH]}"
DOMAIN="${2:?Usage: ./deploy.sh <SERVER_IP> <DOMAIN> [SSH_KEY_PATH]}"
SSH_KEY="${3:-}"

SSH_OPTS="-o StrictHostKeyChecking=no"
if [ -n "$SSH_KEY" ]; then
    SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

SSH_CMD="ssh $SSH_OPTS ubuntu@$SERVER_IP"
SCP_CMD="scp $SSH_OPTS"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$(dirname "$BACKEND_DIR")/domotaicrmVer2"

echo "========================================="
echo "  Deploying DomotaiCRM"
echo "  Server: $SERVER_IP"
echo "  Domain: $DOMAIN"
echo "========================================="

# ── Step 1: Build frontend ──────────────────────────────────────────────────
echo ""
echo "[1/7] Building frontend..."
cd "$FRONTEND_DIR"

# Set production API URL (relative — Nginx proxies to backend)
echo "VITE_API_URL=https://$DOMAIN" > .env.production.local

npm run build
echo "  Frontend build complete ($(du -sh dist | cut -f1))"

# ── Step 2: Build backend ───────────────────────────────────────────────────
echo ""
echo "[2/7] Building backend..."
cd "$BACKEND_DIR"
npm run build
echo "  Backend build complete"

# ── Step 3: Upload frontend ─────────────────────────────────────────────────
echo ""
echo "[3/7] Uploading frontend..."
$SCP_CMD -r "$FRONTEND_DIR/dist/"* "ubuntu@$SERVER_IP:/opt/domotai/frontend/"
echo "  Frontend uploaded"

# ── Step 4: Upload backend ──────────────────────────────────────────────────
echo ""
echo "[4/7] Uploading backend..."

# Create tarball of backend (dist + prisma + package files + deploy configs)
cd "$BACKEND_DIR"
tar czf /tmp/domotai-backend.tar.gz \
    dist/ \
    prisma/ \
    package.json \
    package-lock.json \
    deploy/ecosystem.config.js

$SCP_CMD /tmp/domotai-backend.tar.gz "ubuntu@$SERVER_IP:/tmp/"

$SSH_CMD << 'REMOTE_BACKEND'
cd /opt/domotai/backend
tar xzf /tmp/domotai-backend.tar.gz
rm /tmp/domotai-backend.tar.gz

# Install production dependencies
npm ci --omit=dev --ignore-scripts
npx prisma generate
REMOTE_BACKEND

echo "  Backend uploaded and dependencies installed"

# ── Step 5: Start Docker services ───────────────────────────────────────────
echo ""
echo "[5/7] Starting PostgreSQL + Redis..."
$SCP_CMD "$SCRIPT_DIR/docker-compose.yml" "ubuntu@$SERVER_IP:/opt/domotai/"

$SSH_CMD << 'REMOTE_DOCKER'
cd /opt/domotai

# Source DB_PASSWORD from backend .env
export DB_PASSWORD=$(grep DB_PASSWORD /opt/domotai/backend/.env | cut -d= -f2)

docker compose up -d

# Wait for PostgreSQL to be ready
echo "  Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker exec domotai-postgres pg_isready -U domotai -d domotaicrm &>/dev/null; then
        echo "  PostgreSQL ready"
        break
    fi
    sleep 1
done
REMOTE_DOCKER

# ── Step 6: Run migrations + start backend ──────────────────────────────────
echo ""
echo "[6/7] Running migrations and starting backend..."
$SSH_CMD << 'REMOTE_START'
cd /opt/domotai/backend

# Run Prisma migrations
npx prisma migrate deploy

# Copy PM2 config
cp deploy/ecosystem.config.js .

# Start or restart with PM2
if pm2 list | grep -q domotai-api; then
    pm2 reload ecosystem.config.js
else
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | bash
fi

echo "  Backend started"
REMOTE_START

# ── Step 7: Configure Nginx ─────────────────────────────────────────────────
echo ""
echo "[7/7] Configuring Nginx..."

# Replace domain placeholder in nginx config
sed "s/_DOMAIN_/$DOMAIN/g" "$SCRIPT_DIR/nginx.conf" > /tmp/domotai-nginx.conf
$SCP_CMD /tmp/domotai-nginx.conf "ubuntu@$SERVER_IP:/tmp/domotai-nginx.conf"

$SSH_CMD << REMOTE_NGINX
sudo cp /tmp/domotai-nginx.conf /etc/nginx/sites-available/domotai
sudo ln -sf /etc/nginx/sites-available/domotai /etc/nginx/sites-enabled/domotai
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "  Nginx configured for $DOMAIN"
echo ""
echo "  To enable HTTPS, run on the server:"
echo "  sudo certbot --nginx -d $DOMAIN"
REMOTE_NGINX

rm -f /tmp/domotai-backend.tar.gz /tmp/domotai-nginx.conf

echo ""
echo "========================================="
echo "  Deploy complete!"
echo "========================================="
echo ""
echo "  HTTP:  http://$DOMAIN"
echo "  Health: http://$DOMAIN/health"
echo ""
echo "  Enable HTTPS:"
echo "    ssh $SSH_OPTS ubuntu@$SERVER_IP"
echo "    sudo certbot --nginx -d $DOMAIN"
echo ""
echo "  View logs:"
echo "    ssh $SSH_OPTS ubuntu@$SERVER_IP 'pm2 logs domotai-api'"
echo ""
