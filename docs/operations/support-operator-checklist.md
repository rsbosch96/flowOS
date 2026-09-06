# Controlled Early Access — support operator checklist

Use this checklist for manual support for the first 1–5 Early Access companies. The primary support/operator owner is Ramon / RSTech. The dedicated address remains a placeholder until confirmed: `support@<RSTech-domain>`.

## Intake

Assign `SUP-YYYYMMDD-###` and record only:

- company/tenant, reporter and contact email;
- timestamp and timezone;
- affected FlowOS area and route;
- expected behaviour, actual behaviour and safe reproduction steps;
- request-ID when visible;
- browser/device where relevant;
- a screenshot only after checking that it contains no sensitive data;
- urgency, business impact and any security/privacy suspicion.

Never request or retain passwords, JWTs, session tokens, API keys, raw quote or invitation tokens, or unnecessary customer documents.

## Severity and internal acknowledgement targets

- **SEV-1 Critical:** suspected data exposure, tenant-isolation failure, credential compromise or total outage. Acknowledge as soon as possible during active monitoring.
- **SEV-2 High:** material customer workflow unavailable without a safe workaround. Acknowledge within 4 support hours.
- **SEV-3 Normal:** limited defect with a workaround. Acknowledge the same working day.
- **SEV-4 Low:** question, cosmetic issue or feature request. Best effort / backlog.

**These are internal Early Access targets. They are not contractual SLAs. Resolution times are not guaranteed.**

## Diagnostic sequence

1. Confirm environment, tenant and scope.
2. Check `/api/health` and record status, app/database checks and request-ID.
3. Check UptimeRobot.
4. Check Vercel deployment identity and runtime logs.
5. Check Supabase health/logs without reading secrets or customer content.
6. Correlate request-ID and UTC time window.
7. Inspect exact-scope audit evidence.
8. Inspect memberships/invitations, subscriptions, grants/suspensions or module state only when relevant.
9. Reproduce read-only where safe.

## Decision and closure

Classify the matter as normal support, incident, security/privacy escalation, hotfix candidate or rollback candidate. Pause customer operations and deployments for material or security incidents. Close only with customer validation where appropriate, recovery evidence and follow-up ownership. SEV-1 and SEV-2 require a post-incident review before the next production change.

## Continuity and boundaries

Ramon / RSTech is the current primary operator. A second technical operator is recommended risk mitigation, not an absolute customer #1 blocker. Maintain MFA, account recovery, lost-device procedures, internet-outage fallback and credential-rotation steps; never store recovery secrets here.

Use [incident-response.md](./incident-response.md) for incident/security authority, [early-access-runbook.md](./early-access-runbook.md) for activation/onboarding, [monitoring.md](./monitoring.md) for monitoring and [deployment-rollback.md](./deployment-rollback.md) for rollback. Database restore is never routine support and remains limited to the approved BR1 procedure.
