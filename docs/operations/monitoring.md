# Monitoring runbook

## Active production baseline

FlowOS runs on Vercel Production with Supabase Production. Core, Planning v1,
ENT1 and MON1 are production-proven. `AI_MODE=mock`; OpenAI, Resend, Stripe and
external calendar providers remain disabled.

`GET /api/health` is intentionally unauthenticated and reports only
app/database availability. A healthy response is HTTP 200 with `status: ok`; an
unhealthy database returns a generic HTTP 503. It never exposes database errors,
credentials, tokens, customer data or query details.

## Minimum pilot monitoring

| Signal | Current source | Owner | Action |
| --- | --- | --- | --- |
| Availability | UptimeRobot and Vercel request logs | CEO/Ramon | Investigate non-200 or two consecutive failures |
| Application errors | Structured Vercel server logs with request IDs | CEO/Ramon | Triage 5xx and repeated safe domain errors |
| Database health | Supabase Production dashboard/logs | CEO/Ramon | Investigate API, Auth, Storage or database errors |
| Auth/public-link issues | Supabase Auth logs and application audit logs | CEO/Ramon | Investigate without handling raw public tokens |
| Rate limiting | `rate_limit.blocked` structured events | CEO/Ramon | Distinguish abuse from legitimate pilot activity |

On a failed database health check, FlowOS logs `health.database_unhealthy` with
the request ID, duration, a safe failure category and safe provider/PostgREST
code where available. Never add URLs, keys, JWTs, headers, connection strings,
customer data, SQL or raw provider responses to logs.

## External uptime monitor

**UptimeRobot is active** for HTTPS checks every five minutes against the
production `/api/health` endpoint. The external monitor and a synthetic
down/recovery e-mail alert were proven without disrupting FlowOS.

- Alert destination: CEO-controlled e-mail. A dedicated business alert inbox
  remains an operational decision before external pilot.
- The temporary alert-proof monitor was restored to `/api/health`; do not
  deliberately break a production endpoint for routine monitoring.
- Do not include secrets, tokens, customer data or query parameters in monitor
  URLs, names or alert payloads.

## Daily review

- Confirm health checks are green.
- Review unexpected 5xx, Auth failures, public-link failures and rate-limit blocks.
- Review Supabase usage/alerts and Storage growth.
- Record incidents or notable trends without personal data.

For SEV-1/2 indicators, follow [incident-response.md](./incident-response.md).
The health endpoint is not rate limited; all other protections remain in force.
