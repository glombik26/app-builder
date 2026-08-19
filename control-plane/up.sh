#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "missing control-plane/.env — copy control-plane/.env.example and set ACME_EMAIL and IONOS_API_KEY" >&2
  exit 1
fi

if [[ ! -f auth/htpasswd ]]; then
  echo "missing control-plane/auth/htpasswd — generate with: htpasswd -nbB operator 'secret' > control-plane/auth/htpasswd" >&2
  exit 1
fi

mkdir -p traefik
if [[ ! -f traefik/acme.json ]]; then
  umask 077
  : > traefik/acme.json
fi
chmod 600 traefik/acme.json

mkdir -p /var/lib/app-builder

docker compose --env-file .env up -d --build
