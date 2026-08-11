# Monitoring runbook

## Active production baseline

FlowOS runs on Vercel Production with Supabase Production. Core, Planning v1 and ENT1 are production-proven. `AI_MODE=mock`; OpenAI, Resend, Stripe and external calendar providers remain disabled.

`GET /api/health` is intentionally unauthenticated and reports only app/database availability. A healthy response is HTTP 200 with `status: ok`; an unhealthy database returns a generic HTTP 503. It never exposes database errors, credentials, tokens, customer data or query details.

## Minimum pilot monitoring

| Signal | Current source | Owner | Action |
| --- | --- | --- | --- |
| Availability | Vercel request logs and `/api/health` | CEO/Ramon | Investigate non-200 or two consecutive failures |
| Application errors | Structured Vercel server logs with request IDs | CEO/Ramon | Triage 5xx and repeated safe domain errors |
| Database health | Supabase Production dashboard/logs | CEO/Ramon | Investigate API, Auth, Storage or database errors |
| Auth/public-link issues | Supabase Auth logs and application audit logs | CEO/Ramon | Investigate without handling raw public tokens |
| Rate limiting | `rate_limit.blocked` structured events | CEO/Ramon | Distinguish abuse from legitimate pilot activity |

On a failed database health check, FlowOS safely logs `health.database_unhealthy` with the request ID, duration, failure category (`timeout`, `supabase_api_error` or `unexpected_error`) and a safe provider/PostgREST code when available. Do not add URLs, keys, JWTs, headers, connection strings, customer data, SQL or raw provider responses to logs.

## External uptime monitor

Preferred monitor: **UptimeRobot Free**, configured for HTTPS checks every five minutes against `<production-url>/api/health`.

- Status: **NOT YET CONFIGURED**.
- Alert destination: **OPEN — CEO must choose a dedicated business alert inbox**.
- **EXTERNAL MONITOR SETUP: CEO MANUAL ACTION REQUIRED.**
- Do not include secrets, tokens, customer data or query parameters in monitor URLs, names or alert payloads.
- No external monitor is required for local development.

### Safe alert-proof procedure

After the CEO configures the monitor, create a temporary monitor for `<production-url>/__monitoring-test_404__`. Verify this sequence: real synthetic HTTP failure → monitor detects failure → CEO receives alert → change the monitor target to `/api/health` → monitor detects recovery → CEO receives recovery notification. Delete the temporary test monitor afterwards. This proves alerting without disrupting production.

## Daily review

- Confirm health checks are green.
- Review unexpected 5xx, Auth failures, public-link failures and rate-limit blocks.
- Review Supabase usage/alerts and Storage growth.
- Record incidents or notable trends without personal data.

For SEV-1/2 indicators, follow [incident-response.md](./incident-response.md). The health endpoint is not rate limited; all other protections remain in force.

