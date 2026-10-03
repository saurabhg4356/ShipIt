#!/usr/bin/env bash
# ==============================================================================
# ShipIt - Ubuntu VPS Provisioning & Initial Hardening Script
# Supported OS: Ubuntu 22.04 LTS / 24.04 LTS
# Run as root: sudo bash scripts/vps-init.sh
# ==============================================================================

set -euo pipefail

echo "=========================================="
echo "Starting ShipIt VPS Initialization"
echo "=========================================="

# 1. Update system packages
echo "--> Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  ufw \
  nginx \
  certbot \
  python3-certbot-nginx \
  fail2ban

# 2. Configure UFW Firewall
echo "--> Configuring UFW firewall rules..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (Let\'s Encrypt / Certbot)'
ufw allow 443/tcp comment 'HTTPS'
# Explicitly ensure internal ports are NOT publicly exposed
ufw deny 3000/tcp comment 'Block public access to Node.js'
ufw deny 5432/tcp comment 'Block public access to PostgreSQL'
ufw --force enable
ufw status verbose

# 3. Install Docker Engine & Docker Compose Plugin
if ! command -v docker &> /dev/null; then
  echo "--> Installing Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "--> Docker is already installed."
fi

# 4. Create dedicated deploy user (if not exists)
DEPLOY_USER="deploy"
if ! id "$DEPLOY_USER" &>/dev/null; then
  echo "--> Creating dedicated deployment user: $DEPLOY_USER"
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
  # Setup SSH directory for deploy user
  mkdir -p /home/$DEPLOY_USER/.ssh
  chmod 700 /home/$DEPLOY_USER/.ssh
  touch /home/$DEPLOY_USER/.ssh/authorized_keys
  chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
  chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
  echo "--> Please add your GitHub Actions public SSH key to /home/$DEPLOY_USER/.ssh/authorized_keys"
else
  echo "--> User $DEPLOY_USER already exists. Ensuring membership in docker group..."
  usermod -aG docker "$DEPLOY_USER"
fi

# 5. Create deployment directory structure
APP_DIR="/opt/shipit"
echo "--> Setting up production directory: $APP_DIR"
mkdir -p $APP_DIR
chown -R $DEPLOY_USER:$DEPLOY_USER $APP_DIR
chmod 750 $APP_DIR

echo "=========================================="
echo "VPS Provisioning Completed Successfully!"
echo "Next Steps:"
echo "1. Put production .env file in $APP_DIR/.env (chmod 600 $APP_DIR/.env)"
echo "2. Copy docker-compose.yml into $APP_DIR/docker-compose.yml"
echo "3. Copy nginx/default.conf to /etc/nginx/sites-available/shipit"
echo "4. Obtain SSL certificate: certbot --nginx -d your-domain.com"
echo "=========================================="
