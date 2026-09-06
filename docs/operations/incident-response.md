# Incident response runbook

## Authority and lifecycle

This document is authoritative for incidents and security response. Daily support triage uses [support-operator-checklist.md](./support-operator-checklist.md); customer activation uses [early-access-runbook.md](./early-access-runbook.md); monitoring uses [monitoring.md](./monitoring.md); rollback uses [deployment-rollback.md](./deployment-rollback.md); recovery uses [backup-restore.md](./backup-restore.md). If documents conflict, the domain-specific runbook is authoritative.

The incident lifecycle is: **reported → acknowledged → triaged → investigating → mitigated → resolved → closed**.

## Ownership and severity

Primary support owner and privacy/security escalation: **CEO/Ramon**. Technical backup: **NOT ASSIGNED (open operational risk)**. The CEO is the only authorised log-access owner.

| Severity | Example | Initial response target |
| --- | --- | --- |
| SEV-1 | suspected data breach, cross-tenant access, unauthorized membership/entitlement, leaked credential, suspicious production mutation or total outage | as soon as possible during active monitoring |
| SEV-2 | core customer workflow materially broken or an entitled module unavailable without a safe workaround | within 4 support-hours |
| SEV-3 | degraded/non-critical feature, workaround available | same business day |
| SEV-4 | question, cosmetic issue or feature request | best effort / backlog |

These are internal Early Access targets, not contractual SLAs. Resolution times are not guaranteed.

## First 15 minutes

1. Assign an incident owner and record start time, reporter, environment and request/correlation IDs.
2. Protect users and data first: pause deployments; disable the affected integration/configuration only if authorized and safe.
3. Do not delete logs, mutate customer data, or run unreviewed SQL while investigating.
4. Assess whether the event involves personal data, tenant isolation, documents, invoices or public quote links.
5. Escalate suspected security/privacy incidents to the CEO immediately.

Pause deployments and affected customer operations when scope, tenant isolation, credentials, data integrity or release identity is uncertain. Preserve evidence and never perform broad cleanup.

## Privacy-escalatiepad

Volg naast technische containment altijd deze volgorde wanneer persoonsgegevens
mogelijk zijn geraakt:

1. incident → mogelijke persoonsgegevensimpact;
2. privacy-escalatie → relevante tenant/controller vaststellen;
3. bewijs en reikwijdte veiligstellen → betrokken subprocessor vaststellen;
4. juridische beoordeling → beslissing over eventuele meldingen en communicatie;
5. vastleggen in [data-breach-record-template.md](./templates/data-breach-record-template.md)
   → post-incident review.

Dit pad doet **geen** voorafgaande juridische uitspraak over meldplicht of
termijnen. Alleen de aangewezen juridische beslisser bepaalt die op basis van
de feiten.

## Investigation and containment

- Use Vercel structured server logs, request IDs, Supabase logs/health and audit records. Access to logs is limited to CEO/Ramon.
- Do not place secrets, raw public tokens, full documents, customer message content or credentials in incident notes.
- For a tenant-isolation issue, stop affected public routes or deployment traffic first, then preserve evidence.
- For an external integration issue, keep AI mock-only. OpenAI, Resend, Stripe and calendar providers are disabled for the current pilot.

## Communication

The CEO is the external spokesperson. Support must provide factual status, impact, workaround and next update time; do not speculate or make legal claims. Privacy notification decisions require legal review.

## Closure

Document cause, scope, records affected, containment, recovery, customer communication, corrective action and owner. Validate recovery with `/api/health` three times plus an authenticated read-only smoke where applicable. A SEV-1/2 incident needs a post-incident review before the next production change.

Application rollback is allowed only when the prior version is known to be schema-compatible. Database rollback/restore is not routine support and is allowed only through the approved BR1 procedure. Destructive SQL is never a normal support action. Legal notification requirements remain subject to separate legal/privacy review.

