# Deployment and rollback runbook

## Deployment model

FlowOS is deployed on Vercel Production from `main`, backed by Supabase Production. Core, Planning v1 and ENT1 are production-proven. Preview deployments use staging Supabase; Production and Preview must never share credentials. AI remains mock-only; OpenAI, Resend, Stripe and external calendar providers are disabled.

## Pre-deployment gates

1. CEO approves the change and confirms it is in scope.
2. CI on the exact commit passes `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
3. Migration ledger is reconciled and the release contains no unreviewed database migration.
4. Production configuration checklist is complete.
5. A backup export exists and the recovery path has been drilled. This is a
   release gate, not a statement about the current environment: while BR1 is
   open, do not treat database restore as an available rollback option.
6. Planned deployment/rollback owner and support contact are available.

## Deployment procedure

1. Create/review the release in source control outside this runbook.
2. Deploy the approved commit to staging/preview with synthetic data.
3. Run the pilot smoke test in staging.
4. Deploy the same approved commit to production.
5. Check `GET /api/health`, authentication, tenant routing and one non-destructive smoke flow.
6. Monitor structured logs and Supabase health for 30 minutes.

## Rollback decision triggers

Immediately assess containment for authentication failures, cross-tenant
exposure, failed health checks, data-corruption risk, uncontrolled external
sends/charges or a primary-flow outage. An application rollback is not
automatic: first establish whether the failure began with the deployment,
whether Supabase is healthy and whether the prior application version is
schema-compatible.

## Application rollback

1. Pause new deployments and record the incident/request IDs.
2. Confirm the candidate deployment is known-good and record both deployment
   commits. If the failing release contains a migration, data transformation or
   incompatible schema assumption, stop for migration-compatibility review;
   promoting an older application alone may be unsafe.
3. In Vercel, promote or redeploy the most recent known-good compatible
   production deployment. Do not modify database data as part of an
   application-only rollback.
4. Recheck `/api/health` three times, verify the active Vercel deployment and
   run the affected safe smoke path.
5. If health still reports `database = error`, stop repeated deployments;
   investigate Supabase/API/Postgres evidence and escalate under the incident
   runbook. Database restore remains an isolated-recovery procedure only.
6. Inform pilot users using the approved support process if impact occurred.
7. Preserve logs and create an incident record.

## Database migration recovery

Do not assume a down migration exists. A rollback of application code does not roll back schema or data.

1. Stop and assess the exact migration/data impact.
2. Prefer a new reviewed, additive corrective migration.
3. If restoration is necessary, use [backup-restore.md](./backup-restore.md) to an isolated recovery environment first.
4. Never use `db reset`, blind `db push`, or destructive schema commands in a pilot incident.

