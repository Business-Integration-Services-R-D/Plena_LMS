#!/usr/bin/env bash
set -euo pipefail

for name in AWS_REGION AWS_INSTANCE_ID AWS_ARTIFACT_BUCKET APP_URL RELEASE_SHA; do
  if [ -z "${!name:-}" ]; then
    echo "Missing deployment environment variable: ${name}" >&2
    exit 1
  fi
done

artifact_key="deploy/releases/${RELEASE_SHA}.tar.gz"
artifact_path="${RUNNER_TEMP:-/tmp}/plena-lms-${RELEASE_SHA}.tar.gz"

tar \
  --exclude-vcs \
  --exclude='*/node_modules' \
  --exclude='*/build' \
  --exclude='*/.next' \
  --exclude='*/storage' \
  --exclude='*.env' \
  -czf "${artifact_path}" .

aws s3 cp \
  "${artifact_path}" \
  "s3://${AWS_ARTIFACT_BUCKET}/${artifact_key}" \
  --sse AES256 \
  --region "${AWS_REGION}"

remote_script=$(
  printf 'RELEASE_ID=%q\n' "${RELEASE_SHA}"
  printf 'ARTIFACT_URI=%q\n' "s3://${AWS_ARTIFACT_BUCKET}/${artifact_key}"
  cat <<'REMOTE_SCRIPT'
set -euo pipefail

release_root="/opt/plena-lms/releases"
release_dir="${release_root}/${RELEASE_ID}"
shared_dir="/opt/plena-lms/shared"
shared_env="${shared_dir}/.env.production"
archive="/tmp/plena-lms-${RELEASE_ID}.tar.gz"

install -d -m 0755 "${release_root}" "${release_dir}" "${shared_dir}"

if [ ! -f "${shared_env}" ]; then
  if [ -f /opt/plena-lms/deploy/.env.production ]; then
    install -m 0600 /opt/plena-lms/deploy/.env.production "${shared_env}"
  else
    echo "Production environment file is missing" >&2
    exit 1
  fi
fi

aws s3 cp "${ARTIFACT_URI}" "${archive}"
tar -xzf "${archive}" -C "${release_dir}" --overwrite
install -m 0600 "${shared_env}" "${release_dir}/deploy/.env.production"

bash "${release_dir}/deploy/scripts/activate-release.sh" \
  "${release_dir}" \
  "${APP_URL}"
REMOTE_SCRIPT
)

encoded_script=$(printf '%s' "${remote_script}" | base64 -w 0)
parameters=$(jq -cn \
  --arg command "echo '${encoded_script}' | base64 -d | sudo APP_URL='${APP_URL}' bash" \
  '{commands: [$command]}')

command_id=$(aws ssm send-command \
  --instance-ids "${AWS_INSTANCE_ID}" \
  --document-name AWS-RunShellScript \
  --parameters "${parameters}" \
  --timeout-seconds 1800 \
  --query 'Command.CommandId' \
  --output text \
  --region "${AWS_REGION}")

echo "SSM command: ${command_id}"

final_status=""
for attempt in $(seq 1 120); do
  if ! status=$(aws ssm get-command-invocation \
    --command-id "${command_id}" \
    --instance-id "${AWS_INSTANCE_ID}" \
    --query 'Status' \
    --output text \
    --region "${AWS_REGION}" 2>/dev/null); then
    status="Pending"
  fi

  case "${status}" in
    Success|Cancelled|TimedOut|Failed|Cancelling)
      final_status="${status}"
      break
      ;;
  esac

  sleep 10
done

aws ssm get-command-invocation \
  --command-id "${command_id}" \
  --instance-id "${AWS_INSTANCE_ID}" \
  --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' \
  --output json \
  --region "${AWS_REGION}"

if [ "${final_status}" != "Success" ]; then
  echo "Production deployment failed with status: ${final_status:-poll-timeout}" >&2
  exit 1
fi

curl --fail --silent --show-error --retry 12 --retry-delay 5 \
  "${APP_URL}/api/health"
