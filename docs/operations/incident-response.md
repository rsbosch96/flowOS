# Incident response runbook

## Severity

| Severity | Example | Initial response target |
| --- | --- | --- |
| SEV-1 | suspected data breach, cross-tenant access, total outage | immediately |
| SEV-2 | primary flow broken for a tenant, incorrect financial state risk | within 1 hour |
| SEV-3 | degraded/non-critical feature, workaround available | same business day |

## First 15 minutes

1. Assign an incident owner and record start time, reporter, environment and request/correlation IDs.
2. Protect users and data first: pause deployments; disable the affected integration/configuration only if authorized and safe.
3. Do not delete logs, mutate customer data, or run unreviewed SQL while investigating.
4. Assess whether the event involves personal data, tenant isolation, documents, invoices or public quote links.
5. Escalate suspected security/privacy incidents to the CEO immediately.

## Investigation and containment

- Use structured server logs, request IDs, Supabase logs/health and audit records.
- Do not place secrets, raw public tokens, full documents, customer message content or credentials in incident notes.
- For a tenant-isolation issue, stop affected public routes or deployment traffic first, then preserve evidence.
- For an external integration issue, keep AI mock-only and disable mail/payment credentials as applicable.

## Communication

The CEO is the external spokesperson. Support must provide factual status, impact, workaround and next update time; do not speculate or make legal claims. Privacy notification decisions require legal review.

## Closure

Document cause, scope, records affected, containment, recovery, customer communication, corrective action and owner. A SEV-1/2 incident needs a post-incident review before the next production change.

