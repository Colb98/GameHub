#!/usr/bin/env bash
# One-time VPS hardening + Docker setup for CentOS Stream 8/9 (and RHEL
# derivatives: Rocky / AlmaLinux). Run as root.
set -euo pipefail

# CentOS Stream 8/9 use dnf; keep a yum fallback for older CentOS 7 hosts.
if command -v dnf >/dev/null 2>&1; then
  PKG=dnf
  CFGMGR="dnf config-manager"
  CFGMGR_PKG=dnf-plugins-core
else
  PKG=yum
  CFGMGR="yum-config-manager"
  CFGMGR_PKG=yum-utils
fi

echo "== Base packages, EPEL & automatic security updates =="
# EPEL provides fail2ban; harmless if already present
$PKG install -y epel-release || true
$PKG install -y curl ca-certificates firewalld fail2ban "$CFGMGR_PKG"

# Automatic security updates: dnf-automatic (CentOS 8/9) or yum-cron (CentOS 7)
if $PKG install -y dnf-automatic; then
  sed -i 's/^apply_updates = no/apply_updates = yes/' /etc/dnf/automatic.conf || true
  systemctl enable --now dnf-automatic.timer
else
  $PKG install -y yum-cron || true
  systemctl enable --now yum-cron || true
fi

echo "== Firewall: only SSH + HTTP(S) =="
# firewalld replaces ufw on CentOS. The default 'public' zone already permits
# ssh, so enabling it first won't lock out this session.
systemctl enable --now firewalld
firewall-cmd --permanent --add-service=ssh
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload

echo "== fail2ban (SSH brute-force protection) =="
# RHEL-family ships no default sshd jail; enable one reading the systemd journal
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban

echo "== Docker =="
$CFGMGR --add-repo https://download.docker.com/linux/centos/docker-ce.repo
$PKG install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

echo "== App directory =="
mkdir -p /opt/gamehub
# Let the (non-root) SSH deploy user run docker without sudo, if one exists
if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
  usermod -aG docker "$SUDO_USER"
  echo "  Added ${SUDO_USER} to the 'docker' group (re-login for it to take effect)"
fi

echo
echo "Copy infra/docker-compose.prod.yml, infra/Caddyfile and a filled-in .env"
echo "to /opt/gamehub, then run:"
echo "  cd /opt/gamehub && docker compose -f docker-compose.prod.yml up -d"
echo
echo "Reminders:"
echo "  - SELinux is enforcing on CentOS: host bind mounts in the compose file"
echo "    use the ':z'/':Z' label suffix so Docker can relabel them. Check with"
echo "    'getenforce'. Only disable SELinux ('setenforce 0') as a last resort."
echo "  - Point DNS (proxied via Cloudflare) for DOMAIN, api.DOMAIN, games.DOMAIN at this VPS"
echo "  - Open a port only through firewalld (e.g. 'firewall-cmd --permanent --add-service=...')"
echo "  - Disable SSH password auth in /etc/ssh/sshd_config (PasswordAuthentication no)"
echo "  - Schedule infra/deploy/backup.sh via cron for nightly DB dumps"
