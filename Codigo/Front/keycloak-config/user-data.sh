#!/bin/bash -xe
exec >/var/log/kc-bootstrap.log 2>&1

if [ ! -e /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

dnf install -y docker >/dev/null
systemctl enable --now docker

sudo mkdir -p /opt/keycloak
sudo chown ec2-user:ec2-user /opt/keycloak
cat > /opt/keycloak/docker-compose.yml <<'COMPOSE'
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 10s
      timeout: 5s
      retries: 5
  keycloak:
    image: quay.io/keycloak/keycloak:26.7.3
    restart: unless-stopped
    command: ["start", "--http-enabled=true", "--proxy-headers=xforwarded", "--hostname-strict=false"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${KC_BOOTSTRAP_ADMIN_PASSWORD:?set in .env}
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://db:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${KC_DB_PASSWORD:?set in .env}
      KC_HOSTNAME: https://d5mklesn5mbc7.cloudfront.net
      KC_HEALTH_ENABLED: "true"
      KC_METRICS_ENABLED: "false"
      JAVA_OPTS_APPEND: "-Xms128m -Xmx512m -Xss512k -XX:MaxMetaspaceSize=192m"
    ports:
      - "8080:8080"
    volumes:
      - /opt/keycloak/themes/reservaya:/opt/keycloak/themes/reservaya:ro
    depends_on:
      db:
        condition: service_healthy
volumes:
  pgdata:COMPOSE

sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
sudo mkdir -p /usr/libexec/docker/cli-plugins
sudo ln -sf /usr/local/bin/docker-compose /usr/libexec/docker/cli-plugins/docker-compose

cd /opt/keycloak
# El operador debe crear /opt/keycloak/.env con las variables de docker-compose.yml
# desde el gestor de secretos antes de este punto (nunca versionar ese archivo).
docker compose pull
docker compose up -d --wait
echo 'BOOTSTRAP_OK'
