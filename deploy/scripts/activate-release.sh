#!/usr/bin/env bash
set -euo pipefail

release_dir="${1:?Release directory is required}"
app_url="${2:?Application URL is required}"
compose_file="${release_dir}/deploy/docker-compose.prod.yml"
env_file="${release_dir}/deploy/.env.production"

test -f "${compose_file}"
test -f "${env_file}"

cd "${release_dir}/deploy"

docker compose \
  -p deploy \
  --env-file "${env_file}" \
  -f "${compose_file}" \
  up -d --build --remove-orphans

docker compose \
  -p deploy \
  --env-file "${env_file}" \
  -f "${compose_file}" \
  ps

docker compose \
  -p deploy \
  --env-file "${env_file}" \
  -f "${compose_file}" \
  exec -T backend wget -qO- http://127.0.0.1:3000/api/health

curl --fail --silent --show-error --retry 12 --retry-delay 5 \
  "${app_url}/api/health"

ln -sfn "${release_dir}" /opt/plena-lms/current
