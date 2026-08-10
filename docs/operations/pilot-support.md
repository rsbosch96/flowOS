# Pilot support process

## Pilot contact model

Before inviting a pilot company, the CEO must assign:

- one named business/support contact;
- one technical escalation contact;
- a pilot support mailbox or contact form;
- expected support hours and response targets.

Until these are filled in, do not publish this document externally.

| Item | Required value before pilot |
| --- | --- |
| Support contact | `[name / mailbox]` |
| Technical escalation | `[name / phone or mailbox]` |
| Privacy contact | `[privacy email]` |
| Support hours | `[hours / timezone]` |

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

The initial pilot uses mock AI, manual sharing of customer links, no automatic Resend delivery and no Stripe checkout. Support must not promise live AI, email delivery, payments, recovery-time objectives or legal/compliance guarantees not yet approved.

