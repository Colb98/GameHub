#!/usr/bin/env bash
# One-time VPS hardening + Docker setup (Ubuntu 22.04/24.04). Run as root.
set -euo pipefail

echo "== Base packages & unattended security updates =="
apt-get update
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Firewall: only SSH + HTTP(S) =="
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== fail2ban (SSH brute-force protection) =="
systemctl enable --now fail2ban

echo "== Docker =="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

echo "== App directory =="
mkdir -p /opt/gamehub
echo "Copy infra/docker-compose.prod.yml, infra/Caddyfile and a filled-in .env"
echo "to /opt/gamehub, then run:"
echo "  cd /opt/gamehub && docker compose -f docker-compose.prod.yml up -d"
echo
echo "Reminders:"
echo "  - Point DNS (proxied via Cloudflare) for DOMAIN, api.DOMAIN, games.DOMAIN at this VPS"
echo "  - Disable SSH password auth in /etc/ssh/sshd_config (PasswordAuthentication no)"
echo "  - Schedule infra/deploy/backup.sh via cron for nightly DB dumps"
