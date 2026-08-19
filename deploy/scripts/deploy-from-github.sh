#!/usr/bin/env bash
set -euo pipefail

for name in AWS_REGION AWS_INSTANCE_ID AWS_ARTIFACT_BUCKET APP_URL RELEASE_SHA RESEND_API_KEY; do
  if [ -z "${!name:-}" ]; then
    echo "Missing deployment environment variable: ${name}" >&2
    exit 1
  fi
done

artifact_key="deploy/releases/${RELEASE_SHA}.tar.gz"
artifact_path="${RUNNER_TEMP:-/tmp}/plena-lms-${RELEASE_SHA}.tar.gz"
mail_secret_key="deploy/releases/${RELEASE_SHA}.mail-config"
mail_secret_path="${RUNNER_TEMP:-/tmp}/plena-lms-${RELEASE_SHA}.mail-config"
email_from="${EMAIL_FROM:-Plena LMS <noreply@bislabs.tech>}"

umask 077
mail_secret_uploaded=false
cleanup() {
  rm -f "${artifact_path}" "${mail_secret_path}"
  if [ "${mail_secret_uploaded}" = true ]; then
    aws s3 rm \
      "s3://${AWS_ARTIFACT_BUCKET}/${mail_secret_key}" \
      --region "${AWS_REGION}" \
      >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ ! "${RESEND_API_KEY}" =~ ^re_[A-Za-z0-9_-]+$ ]]; then
  echo "RESEND_API_KEY format is invalid" >&2
  exit 1
fi
if [[ "${email_from}" == *$'\n'* || "${email_from}" == *$'\r'* ]]; then
  echo "EMAIL_FROM contains an invalid newline" >&2
  exit 1
fi

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

# Secret is never embedded in the release archive or SSM command. The private,
# encrypted-at-rest object is consumed and deleted by the EC2 deployment step.
printf '%s\n%s\n' "${RESEND_API_KEY}" "${email_from}" > "${mail_secret_path}"
aws s3 cp \
  "${mail_secret_path}" \
  "s3://${AWS_ARTIFACT_BUCKET}/${mail_secret_key}" \
  --sse AES256 \
  --region "${AWS_REGION}"
mail_secret_uploaded=true

remote_script=$(
  printf 'RELEASE_ID=%q\n' "${RELEASE_SHA}"
  printf 'ARTIFACT_URI=%q\n' "s3://${AWS_ARTIFACT_BUCKET}/${artifact_key}"
  printf 'MAIL_SECRET_URI=%q\n' "s3://${AWS_ARTIFACT_BUCKET}/${mail_secret_key}"
  printf 'APP_URL=%q\n' "${APP_URL}"
  cat <<'REMOTE_SCRIPT'
set -euo pipefail

release_root="/opt/plena-lms/releases"
release_dir="${release_root}/${RELEASE_ID}"
shared_dir="/opt/plena-lms/shared"
shared_env="${shared_dir}/.env.production"
archive="/tmp/plena-lms-${RELEASE_ID}.tar.gz"
mail_secret="/tmp/plena-lms-${RELEASE_ID}.mail-config"

umask 077
trap 'rm -f "${archive}" "${mail_secret}"' EXIT

install -d -m 0755 "${release_root}" "${release_dir}" "${shared_dir}"

if [ ! -f "${shared_env}" ]; then
  if [ -f /opt/plena-lms/deploy/.env.production ]; then
    install -m 0600 /opt/plena-lms/deploy/.env.production "${shared_env}"
  else
    echo "Production environment file is missing" >&2
    exit 1
  fi
fi

aws s3 cp "${MAIL_SECRET_URI}" "${mail_secret}"
mapfile -t mail_config < "${mail_secret}"
resend_api_key="${mail_config[0]:-}"
email_from="${mail_config[1]:-}"

if [[ ! "${resend_api_key}" =~ ^re_[A-Za-z0-9_-]+$ ]]; then
  echo "Downloaded RESEND_API_KEY format is invalid" >&2
  exit 1
fi
if [ -z "${email_from}" ] || [[ "${email_from}" == *$'\n'* || "${email_from}" == *$'\r'* ]]; then
  echo "Downloaded EMAIL_FROM is invalid" >&2
  exit 1
fi

# Preserve database/auth/storage values already managed on EC2 and replace only
# the mail integration settings received from the protected GitHub environment.
updated_env="$(mktemp "${shared_env}.tmp.XXXXXX")"
awk '
  !/^RESEND_API_KEY=/ &&
  !/^EMAIL_FROM=/
' "${shared_env}" > "${updated_env}"
escaped_email="${email_from//\\/\\\\}"
escaped_email="${escaped_email//\"/\\\"}"
printf 'RESEND_API_KEY=%s\n' "${resend_api_key}" >> "${updated_env}"
printf 'EMAIL_FROM="%s"\n' "${escaped_email}" >> "${updated_env}"
install -m 0600 "${updated_env}" "${shared_env}"
rm -f "${updated_env}" "${mail_secret}"

# Best-effort removal keeps the private deployment bucket from becoming a
# long-lived secret store. The EC2 role created by aws-infrastructure.yml has
# DeleteObject permission on this bucket.
if ! aws s3 rm "${MAIL_SECRET_URI}"; then
  echo "Warning: temporary mail secret object could not be deleted" >&2
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
  --arg command "echo '${encoded_script}' | base64 -d | sudo bash" \
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
