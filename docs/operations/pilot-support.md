# Controlled Early Access support process

For daily triage use [support-operator-checklist.md](./support-operator-checklist.md). Record incidents with [support-incident-record-template.md](./templates/support-incident-record-template.md) and use the communication templates in [support-communication-templates.md](./templates/support-communication-templates.md). Incident and security authority remains [incident-response.md](./incident-response.md).

## Pilot contact model

| Item | Current pilot value |
| --- | --- |
| Support contact | `support@<RSTech-domain>` — final address not yet confirmed |
| Technical escalation | **NOT ASSIGNED — open risk** |
| Privacy/security contact | CEO/Ramon |
| Alert/support destination | **OPEN — dedicated business inbox still required** |
| Support hours | Monday–Friday, 09:00–18:00 Europe/Amsterdam |
| Initial acknowledgement target | SEV-1 as soon as possible; SEV-2 within 4 support hours; SEV-3 same working day; SEV-4 best effort. Internal targets, not contractual SLAs. |

## Intake template

Collect only: company/tenant, reporter/contact email, affected feature, timestamp/timezone, expected and actual behaviour, safe reproduction steps, browser/device, safe screenshot and request ID where shown. Never ask users to send passwords, JWTs, session tokens, API keys, raw public links/tokens, full customer documents or full invoice data in an ordinary support message.

## Triage

| Type | First action |
| --- | --- |
| Login/access | verify account and company membership; never disclose another tenant's existence |
| Quote/public link | verify status and expiry through approved admin process; do not request raw token by email |
| Invoice | preserve snapshots/audit trail; do not manually alter issued invoice data |
| Security/privacy | classify as SEV-1, preserve evidence, follow [incident-response.md](./incident-response.md), escalate to CEO immediately |
| Availability | check `/api/health` and monitoring; communicate known outage status |

## Pilot boundaries

Controlled Early Access uses mock AI, manual sharing of customer links, no automatic Resend delivery, no Stripe checkout and no external calendar provider. Planning v1 is available only when the organisation has the Planning entitlement. Field Service and AICS remain outside the Early Access scope. Support must not promise live AI, email delivery, payments, recovery-time objectives, contractual SLAs or legal/compliance guarantees not yet approved. A functioning dedicated support inbox must be configured before customer #1; email/manual registration is sufficient for 1–5 customers.

