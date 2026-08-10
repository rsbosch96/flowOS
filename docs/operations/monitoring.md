# Monitoring runbook

## Minimum pilot monitoring

| Signal | How | Owner | Action |
| --- | --- | --- | --- |
| Availability | `GET /api/health` every 5 minutes from an external HTTPS monitor | CEO/operations | investigate non-200 or 2 consecutive failures |
| Application errors | structured server logs with request/correlation IDs | engineering | triage 5xx and repeated domain errors |
| Database health | Supabase project dashboard/logs | operations | investigate DB/auth/storage errors |
| Auth and public-link issues | Supabase/auth and application audit logs | engineering | investigate failures without logging raw tokens |
| Rate limiting | `rate_limit.blocked` structured events | engineering | distinguish abuse from legitimate pilot activity |

The health endpoint is intentionally unauthenticated and must remain available for monitoring. It reports application/database availability only; it is not a full business-flow check.

## Free monitoring option

Use a free external HTTPS monitor during the pilot if its current plan limits meet the pilot need. It should alert the CEO/operations contact on health endpoint failures. Do not include secrets, tokens or customer data in monitor URLs, names or alert payloads.

## Daily review

- Confirm health checks are green.
- Review unexpected 5xx, auth failures, public-token failures and rate-limit blocks.
- Review Supabase usage/alerts and Storage growth.
- Record incidents or notable trends without personal data.

## Alert handling

For SEV-1/2 indicators, follow [incident-response.md](./incident-response.md). The public health endpoint is not rate limited; all other protection remains as implemented.

