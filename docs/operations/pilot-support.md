# Pilot support process

## Pilot contact model

| Item | Current pilot value |
| --- | --- |
| Support contact | CEO/Ramon |
| Technical escalation | **NOT ASSIGNED — open risk** |
| Privacy/security contact | CEO/Ramon |
| Alert/support destination | **OPEN — dedicated business inbox still required** |
| Support hours | Monday–Friday, 09:00–18:00 Europe/Amsterdam |
| Initial review target | Within 4 hours during support hours; internal target, not a contractual SLA |

## Intake template

Collect only: company name, contact method, affected feature, time, steps to reproduce, safe screenshot, and request ID where shown. Never ask users to send passwords, API keys, raw public links, full customer documents or full invoice data in an ordinary support message.

## Triage

| Type | First action |
| --- | --- |
| Login/access | verify account and company membership; never disclose another tenant's existence |
| Quote/public link | verify status and expiry through approved admin process; do not request raw token by email |
| Invoice | preserve snapshots/audit trail; do not manually alter issued invoice data |
| Security/privacy | follow [incident-response.md](./incident-response.md), escalate to CEO immediately |
| Availability | check `/api/health` and monitoring; communicate known outage status |

## Pilot boundaries

The initial pilot uses mock AI, manual sharing of customer links, no automatic Resend delivery, no Stripe checkout and no external calendar provider. Planning v1 is available only when the organisation has the Planning entitlement. Support must not promise live AI, email delivery, payments, recovery-time objectives or legal/compliance guarantees not yet approved.

