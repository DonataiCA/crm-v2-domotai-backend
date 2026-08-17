#!/bin/bash
# ============================================================================
# DomotaiCRM — First-time EC2 server setup
# Run as: ssh -i key.pem ubuntu@<IP> 'bash -s' < setup-server.sh
# ============================================================================
set -euo pipefail

echo "========================================="
echo "  DomotaiCRM Server Setup"
echo "========================================="

# ── System updates ───────────────────────────────────────────────────────────
echo "[1/8] Updating system packages..."
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# ── Install Docker ───────────────────────────────────────────────────────────
echo "[2/8] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker ubuntu
    sudo systemctl enable docker
    sudo systemctl start docker
fi

# Install docker-compose plugin
if ! docker compose version &> /dev/null; then
    sudo apt-get install -y -qq docker-compose-plugin
fi

# ── Install Node.js 24 LTS ──────────────────────────────────────────────────
# Debe coincidir con "engines" de package.json (>=22.12.0) y con .nvmrc.
# openai v7 y google-auth-library v11 exigen Node >= 22: con Node 20 el
# servidor no arranca. La comprobación mira la versión, no la mera presencia
# del binario, para que un servidor con Node 20 preinstalado también se corrija.
echo "[3/8] Installing Node.js 24 LTS..."
NODE_MAJOR_REQUIRED=22
CURRENT_MAJOR="$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')"
if [ -z "$CURRENT_MAJOR" ] || [ "$CURRENT_MAJOR" -lt "$NODE_MAJOR_REQUIRED" ]; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
    echo "  Node $(node -v) instalado"
else
    echo "  Node $(node -v) ya cumple el mínimo (>= v$NODE_MAJOR_REQUIRED)"
fi

# Install PM2 globally
echo "[4/8] Installing PM2..."
sudo npm install -g pm2

# ── Install Nginx ────────────────────────────────────────────────────────────
echo "[5/8] Installing Nginx..."
sudo apt-get install -y -qq nginx
sudo systemctl enable nginx

# ── Install Certbot ──────────────────────────────────────────────────────────
echo "[6/8] Installing Certbot..."
sudo apt-get install -y -qq certbot python3-certbot-nginx

# ── Create app directories ──────────────────────────────────────────────────
echo "[7/8] Creating app directories..."
sudo mkdir -p /opt/domotai/backend
sudo mkdir -p /opt/domotai/frontend
sudo mkdir -p /var/log/domotai
sudo chown -R ubuntu:ubuntu /opt/domotai
sudo chown -R ubuntu:ubuntu /var/log/domotai

# ── Setup firewall ──────────────────────────────────────────────────────────
echo "[8/8] Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Copy deploy/.env.production to the server and edit with real values:"
echo "     scp deploy/.env.production ubuntu@<IP>:/opt/domotai/backend/.env"
echo ""
echo "  2. Copy deploy/docker-compose.yml and start PostgreSQL + Redis:"
echo "     scp deploy/docker-compose.yml ubuntu@<IP>:/opt/domotai/"
echo "     ssh ubuntu@<IP> 'cd /opt/domotai && docker compose up -d'"
echo ""
echo "  3. Run deploy.sh to deploy the application:"
echo "     ./deploy/deploy.sh <IP> <DOMAIN>"
echo ""
