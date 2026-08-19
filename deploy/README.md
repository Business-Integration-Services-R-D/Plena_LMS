# AWS production deployment

This deployment runs the frontend, API and Caddy on EC2. PostgreSQL is hosted
on private RDS and course files are stored in a private S3 bucket.

## Required AWS resources

- EC2 instance with Docker and the SSM agent
- Private RDS PostgreSQL instance
- Private S3 bucket
- EC2 IAM role with access limited to the application bucket
- DNS A record pointing the application domain to the EC2 Elastic IP
- Security group ingress for HTTP (80) and HTTPS (443)

`aws-infrastructure.yml` creates these resources in one CloudFormation stack.
The RDS instance is private, the S3 bucket blocks public access, and EC2 is
managed through SSM Session Manager without opening SSH port 22.

The application uses the AWS SDK default credential chain. Do not put access
keys in `.env.production`; attach an IAM role to the EC2 instance instead.

## Start

```bash
cd deploy
cp .env.production.example .env.production
# Fill in domain, RDS URL, S3 bucket and a random AUTH_SECRET.
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## Update

```bash
git pull --ff-only
cd deploy
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## Verify

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -fsS "https://${APP_DOMAIN}/api/health"
```

## GitHub Actions production pipeline

Pull requests run backend tests/build and the frontend build. After a merge to
`main`, `.github/workflows/deploy-production.yml` starts from the successful
completion of the `CI` workflow. Keeping deployment as a direct workflow lets
the protected `production` environment provide its secrets to the job. The
deployment workflow:

1. assumes a least-privilege AWS role through GitHub OIDC;
2. packages the exact merge commit and uploads it to the private S3 bucket;
3. asks the EC2 instance to activate the release through SSM;
4. waits for the container and public health checks to pass.

No long-lived AWS access key is stored in GitHub.

### One-time AWS bootstrap

Deploy `github-oidc.yml` as a separate CloudFormation stack. If this AWS
account already has the GitHub Actions OIDC provider, pass its ARN through
`ExistingOidcProviderArn`; otherwise leave that parameter empty.

The stack requires the production artifact bucket name and EC2 instance ID.
Copy its `DeployRoleArn` output into the GitHub production environment.
Update this stack after changes to `github-oidc.yml`; the current policy allows
the runner to delete temporary mail-secret objects after deployment.

### GitHub production variables

Create a protected GitHub environment named `production`, restricted to the
`main` branch, and add these environment variables:

- `AWS_REGION`
- `AWS_ACCOUNT_ID`
- `AWS_DEPLOY_ROLE_ARN`
- `AWS_INSTANCE_ID`
- `AWS_ARTIFACT_BUCKET`
- `APP_URL`
- `EMAIL_FROM` (for example `Plena LMS <noreply@bislabs.tech>`)

Add this protected environment secret:

- `RESEND_API_KEY`

The existing `/opt/plena-lms/deploy/.env.production` file is migrated to
`/opt/plena-lms/shared/.env.production` on the first automated deployment.
Database credentials and the application secret remain on EC2 and never pass
through GitHub Actions.

During deployment, the Resend key is uploaded separately from the release
archive to the private artifact bucket with S3 server-side encryption. The EC2
deployment step writes only `RESEND_API_KEY` and `EMAIL_FROM` into the shared
production environment, then deletes the temporary local and S3 copies. The
secret is never embedded in the Git repository, release archive or SSM command.
