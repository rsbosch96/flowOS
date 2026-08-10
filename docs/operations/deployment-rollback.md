# Deployment and rollback runbook

## Deployment model

Recommended pilot model: Vercel production deployment from protected `main`, with GitHub Actions quality gates. This is a proposed operating model; no hosting provider is configured by this document.

## Pre-deployment gates

1. CEO approves the change and confirms it is in scope.
2. CI on the exact commit passes `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
3. Migration ledger is reconciled and the release contains no unreviewed database migration.
4. Production configuration checklist is complete.
5. A backup export exists and the recovery path has been drilled.
6. Planned deployment/rollback owner and support contact are available.

## Deployment procedure

1. Create/review the release in source control outside this runbook.
2. Deploy the approved commit to staging/preview with synthetic data.
3. Run the pilot smoke test in staging.
4. Deploy the same approved commit to production.
5. Check `GET /api/health`, authentication, tenant routing and one non-destructive smoke flow.
6. Monitor structured logs and Supabase health for 30 minutes.

## Rollback decision triggers

Rollback immediately for authentication failures, cross-tenant exposure, failed health check, data corruption risk, uncontrolled external sends/charges, or a primary-flow outage.

## Application rollback

1. Pause new deployments and record the incident/request IDs.
2. In the hosting provider, promote/redeploy the most recent known-good production deployment. Do not modify database data as part of an application-only rollback.
3. Recheck `/api/health` and the affected safe smoke path.
4. Inform pilot users using the approved support process if impact occurred.
5. Preserve logs and create an incident record.

## Database migration recovery

Do not assume a down migration exists. A rollback of application code does not roll back schema or data.

1. Stop and assess the exact migration/data impact.
2. Prefer a new reviewed, additive corrective migration.
3. If restoration is necessary, use [backup-restore.md](./backup-restore.md) to an isolated recovery environment first.
4. Never use `db reset`, blind `db push`, or destructive schema commands in a pilot incident.

