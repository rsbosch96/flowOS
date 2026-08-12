# OPS-001 — incident and rollback tabletop

> **TABLETOP / SIMULATION ONLY — 2026-08-12**
>
> No real outage was created. No production rollback was performed. No
> production or staging data was changed.

## Scope and baseline

| Item | Evidence | Result |
| --- | --- | --- |
| Production identity | Supabase project `ivifmemxvgglvnnarubt`, FlowOS Production, `ACTIVE_HEALTHY` | PASS |
| Production health | `GET /api/health` | HTTP 200; `app: ok`; `database: ok` |
| Vercel deployment | Production deployment metadata | `READY` |
| Monitoring | UptimeRobot HTTPS health check every five minutes; prior down/recovery proof | PASS |
| Providers | AI mock mode; OpenAI, Resend, Stripe and calendar providers disabled | PASS |
| Backup / restore | BR1 real backup and isolated restore drill | **OPEN — not a rollback mechanism** |

Participants/roles available: CEO/Ramon as incident owner and authorised log
access owner. Technical backup and dedicated alert/support inbox remain **NOT
ASSIGNED / OPEN**.

## Synthetic incident

Immediately after a hypothetical application deployment, UptimeRobot reports
FlowOS DOWN. `GET /api/health` hypothetically returns HTTP 503 with `app: ok`
and `database: error`; users report that FlowOS pages fail to load. There is no
evidence of data corruption, unauthorised access, provider activation or
credential compromise.

## Detection and classification

1. UptimeRobot sends the first availability alert after a failed five-minute
   HTTPS health check.
2. The operator confirms the production URL and reproduces the generic 503
   health response without adding parameters or credentials.
3. The operator records UTC time and `x-request-id` when present, then uses the
   Vercel runtime log and matching Supabase API/Postgres log time window.

Classification: **SEV-1 availability incident** while the core application is
unavailable. Customer impact is complete inability to use core pages. The
initial suspected component is database/API connectivity, not a confirmed
application regression. This fact pattern alone is **not** a security incident
or confirmed personal-data breach; start the privacy path only if evidence
later indicates unauthorised disclosure, access, alteration or credential
compromise.

## Read-only triage sequence

1. Confirm Vercel Production URL/project and the production Supabase project
   reference.
2. Confirm health failure and capture only safe response data and request ID.
3. Inspect Vercel deployment metadata: deployment time, active commit and
   prior known-good production deployment.
4. Inspect Vercel runtime logs for the request-ID/time window.
5. Inspect Supabase API/Postgres health and logs for the same UTC window.
6. Compare the first failure time with the deployment, but do not infer
   causation from timing alone.
7. Classify as application regression, Supabase incident, configuration issue,
   transient networking issue or unknown only when evidence supports it.

## Containment and rollback decision

| Option | Tabletop decision |
| --- | --- |
| Wait / observe | Appropriate only for a short, evidenced transient Supabase/network event while impact is monitored. |
| Application rollback | **Conditional.** Appropriate when failure starts with the deploy, Supabase is healthy, no incompatible migration was included and a compatible known-good deployment exists. |
| Database rollback | Inappropriate as routine containment. BR1 has no proven real backup/restore drill; never reset or destructively alter financial/tenant data. |
| Configuration rollback | Conditional and only after identifying the exact changed configuration and obtaining authorisation. |
| Provider kill switch | Not applicable: providers are already disabled. |
| Customer communication | Appropriate for continuing material impact; communicate confirmed facts, impact, action underway and a next update target without SLA or legal claims. |

### Go / no-go tree

```text
Health fails after deployment
├─ Supabase/API incident or database health unresolved?
│  └─ Yes → no repeated deployments; escalate Supabase investigation.
├─ Release includes migration/data change or prior app is not schema-compatible?
│  └─ Yes → no application rollback until compatibility review.
├─ Failure starts with release + prior deployment known-good/compatible?
│  └─ Yes → authorised application rollback.
└─ Cause unknown or corruption suspected
   └─ Preserve evidence, pause deployments, escalate; no destructive database action.
```

For the supplied scenario, the rollback decision is **CONDITIONAL**. A database
error persisting after rollback makes Supabase investigation primary; do not
cycle deployments. Escalate the incident owner, communicate an ongoing
availability incident as needed and use the future BR1 isolated recovery method
only when an approved, verified backup/restore path exists.

## Hypothetical post-rollback verification

After an authorised compatible application rollback:

1. Verify `GET /api/health` three times: HTTP 200, `app: ok`, `database: ok`.
2. Verify Vercel reports the intended rollback deployment as `READY` and active.
3. Review safe runtime-log categories for a new recurring error pattern.
4. Perform login/auth, tenant-route and Core read-only smoke checks.
5. Perform safe Planning and entitlement sanity checks.
6. Confirm providers remain disabled and no new external action occurred.
7. Record recovery time, verification evidence and communications decision.

If health remains HTTP 503 with `database: error`, stop rollback attempts,
preserve correlation evidence and investigate Supabase API/Postgres status.
Database restore is not authorised or assumed available; BR1 is an explicit
recovery limitation.

## Internal communication structure

| Field | Tabletop value |
| --- | --- |
| Start | `[UTC timestamp]` |
| Impact | Confirmed availability effect only |
| Facts | Health status, deployment status, safe request-ID reference |
| Unknowns | Root cause, data impact and duration until investigated |
| Actions | Triage source currently being checked; rollback decision state |
| Next update | `[target time set by incident owner]` |
| Recovery | Health 3x and safe smoke evidence before declaring recovery |

Do not invent a support SLA, technical backup contact, privacy/legal contact or
customer notification obligation. Those are owner/approval gaps.

## Findings

| Classification | Finding | Follow-up |
| --- | --- | --- |
| A — correct/current | UptimeRobot, generic health contract, Vercel/Supabase evidence and provider-disabled baseline match reality. | Retain. |
| A — correct/current | Database rollback is already non-routine and isolated recovery is required. | Retain. |
| B — incomplete | Rollback runbook did not explicitly require migration compatibility before promoting an older application. | Clarified in runbook. |
| B — incomplete | Request-ID procedure did not state the practical Vercel → Supabase correlation sequence. | Clarified in runbook. |
| B — incomplete | Technical backup/escalation owner and dedicated support/alert destination remain unassigned. | CEO decision required. |
| B — incomplete | BR1 real backup plus isolated restore proof is absent. | Budget/approval gate remains open. |

## Exercise conclusion

The available procedures support detection, safe read-only triage, containment,
conditional application rollback, verification and factual communication.
They do **not** justify a destructive database rollback. The scenario is an
availability incident only unless further evidence establishes a security or
privacy event.
