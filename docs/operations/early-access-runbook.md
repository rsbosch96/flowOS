# FlowOS Controlled Early Access Operations Runbook

**Status:** operational draft for CTO review
**Product:** FlowOS
**Company:** RSTech
**Launch model:** Controlled Early Access
**Initial scale:** 1–5 companies

This is the authoritative operating procedure for the first controlled Early
Access customers. It is a manual runbook, not an application feature. It does
not grant approval to activate a customer, change production data, or enable a
provider.

## 1. Ownership and operating contract

| Role | Current owner | Operating note |
| --- | --- | --- |
| Primary operator | CEO / Ramon | Owns the go/no-go decision and evidence ledger. |
| CTO | ChatGPT | Reviews the runbook and release/operations evidence. |
| Technical operator | CEO currently | Technical backup is not assigned; this is a key-person risk, not an absolute blocker for customer #1. |
| Privacy owner | CEO currently | Legal decisions remain with the approved legal decision-maker. |
| Support owner | CEO currently | Support is manual for 1–5 companies. |
| Backup/recovery owner | CEO temporarily | A replacement owner is required as a mitigation before scale. |

Before each activation, record the operator, date, environment, release commit,
and the evidence location. Never put passwords, tokens, JWTs, API keys or
payment-card data in this runbook or the evidence ledger.

## 2. Early Access product contract

The approved proposition is:

**FlowOS Early Access — €49/month excl. VAT**

Includes:

- three total users/seats, including the owner;
- Core;
- Planning.

Additional seats are **€9/month excl. VAT**. The introductory price applies for
12 months from customer activation. No other price, discount, term or roadmap
promise is approved by this runbook.

Excluded and not sold:

- Field Service;
- AI Customer Service.

Payment automation is disabled/not implemented. Stripe is disabled. Any manual
commercial activation remains blocked until the controlled activation capability
is implemented and accepted under ZC2.3.

## 3. Authoritative system boundaries

- **Core** is implicit for a valid company membership.
- **Planning** is released but entitlement-dependent.
- **Field Service** is `planned` and must remain inaccessible.
- **AI Customer Service (AICS)** is `planned` and must remain inaccessible.
- **Seats** are enforced by the server-side capacity authority; never infer capacity from the browser.
- **Effective entitlements** are the runtime authorization authority.
- The **commercial catalog** describes products that may be offered; it is not by itself authorization.
- A trusted **subscription snapshot** is the commercial contract authority once safely activated.
- **Stripe** is a future payment provider only and is never product authorization authority.
- The **website** is marketing/display only and is never authorization authority.

`release state != entitlement`: granting an entitlement cannot release a module
that is still `planned`.

## 4. Customer #1 mandatory go/no-go gate

Complete this checklist for every company. **GO is allowed only when every
item is PASS. There is no verbal override. Any failed item is NO-GO.**

### Recovery and security

- [ ] Real production backup completed.
- [ ] Encrypted offsite copy completed.
- [ ] Isolated restore drill passed.
- [ ] RPO recorded from evidence, not estimated.
- [ ] RTO recorded from evidence, not estimated.

### Company, legal and privacy

- [ ] Company/legal-entity details finalized.
- [ ] Privacy documentation approved.
- [ ] Early Access terms/contract ready.
- [ ] Support and privacy contacts finalized.

### Commercial and module provisioning

- [ ] Safe commercial activation path implemented and accepted.
- [ ] Early Access subscription snapshot can be created safely.
- [ ] Three-seat capacity is proven.
- [ ] Planning commercial provisioning is proven.
- [ ] Field Service remains denied.
- [ ] AICS remains denied.

### Production and ownership

- [ ] Production health is green.
- [ ] Current production release is approved.
- [ ] No open CRITICAL security incident exists.
- [ ] An onboarding owner is assigned.

Until all boxes are green, the company remains a prospect or internal
synthetic test tenant and receives no real customer data.

## 5. Lead-to-customer operating flow

| Step | Owner | Action | Evidence | Stop condition |
| --- | --- | --- | --- | --- |
| 1. Prospect identified | CEO | Record a non-sensitive prospect reference. | Customer record template; no credentials. | Identity or authority is unclear. |
| 2. Suitability check | CEO | Confirm the company fits the controlled Early Access scope. | Completed checklist. | Requirements need an excluded module or unapproved provider. |
| 3. Commercial discussion | CEO | Explain €49/month, three seats, €9 extra seat, 12-month intro price, and exclusions. | Written commercial note/acceptance. | Any unapproved price or promise is requested. |
| 4. Legal/privacy acceptance | CEO/privacy owner | Obtain approved terms and privacy acceptance. | Approved record and date. | Legal review or company details remain open. |
| 5. GO/NO-GO gate | CEO | Complete Section 4. | Signed internal gate record. | Any mandatory item is not PASS. |
| 6. Authentication/signup | Customer with CEO support | Use the normal Supabase Auth signup/login flow. | User/company identifier, never a password or token. | Auth or email-confirmation behavior is uncertain. |
| 7. Company bootstrap | Customer/CEO | Use `/onboarding` and `bootstrap_company`; do not use production SQL. | Company ID, owner membership, profile completion. | Duplicate company, wrong tenant or partial state is observed. |
| 8. Company identity verification | CEO | Verify legal/company details and authorized owner. | Read-only profile check. | Details do not match approved company evidence. |
| 9. Commercial activation | Authorized operator | Use the guarded internal operator route in Section 7. | Activation result, subscription/grant IDs and audit events. | Route disabled, company ineligible, conflict or incomplete result. |
| 10. Seat verification | CEO/operator | Verify included seats, active memberships and pending invitations. | Read-only seat snapshot. | Capacity or subscription authority cannot be proven. |
| 11. Planning verification | CEO/operator | Verify Planning is released and effectively entitled. | Read-only resolver result and audit evidence. | Grant path is manual/unproven or module is not released. |
| 12. First-login acceptance | CEO/operator | Run Section 8 without creating business records. | Completed smoke checklist. | Wrong tenant, error, unexpected module or data exposure. |
| 13. Customer onboarding | CEO | Walk through the approved Core/Planning flow. | Onboarding completion record. | Customer needs excluded functionality or live providers. |
| 14. Support handoff | CEO | Explain manual support intake and severity. | Contact and support record. | No safe contact or escalation route exists. |
| 15. Onboarding completion | CEO | Close the operational record and schedule the manual cadence. | Customer record template and open-items list. | Any unresolved critical item remains. |

Where a capability is not available, record **BLOCKED — IMPLEMENTATION REQUIRED**.
Do not invent a workaround or perform direct production SQL.

## 6. Company bootstrap and ownership

The current safe application path is:

`Supabase Auth → /onboarding → bootstrap_company → company → profile → owner membership`

`bootstrap_company` is transactional and protects the initial owner membership.
Company creation is separate from commercial activation: successful bootstrap does
not mean the Early Access contract is active or paid. Check for duplicate-company
risk before accepting the result and verify the tenant context after login.

Do not use a direct production SQL fallback. If bootstrap fails or creates an
unexpected relationship, stop, preserve evidence and follow the incident runbook.

## 7. Commercial activation boundary and operator procedure

The controlled operator path is enabled only when the deployment explicitly sets
the server-only `FLOWOS_EARLY_ACCESS_OPERATOR_ENABLED=true` and provides an
operator key through `FLOWOS_EARLY_ACCESS_OPERATOR_KEY`. These values are never
stored in the repository or exposed to browser code.

### Eligibility

Before calling the route, complete Section 4 and verify the exact company ID,
authorized owner, production project identity and current health. The company
must not have an access-bearing primary subscription, and active memberships
plus valid pending invitations must not exceed three. Do not activate a demo,
historical acceptance tenant or a company with uncertain provenance.

### Operator action

1. Call `POST /api/internal/early-access/activate` from the trusted server-side operator context.
2. Send only the exact `companyId` in the JSON body.
3. Send the deployment-only operator key in the server-controlled header; never expose it to a normal company owner or client bundle.
4. Treat a non-200 response as **NO-GO**. Do not retry blindly or use SQL.

The route validates the operator key, calls the service-role-only
`activate_early_access_company` RPC and returns a safe activation result. Normal
authenticated users and company owners cannot call the RPC directly.

### Expected result and verification

The successful result must show an active, primary provider-neutral snapshot:

- plan `early_access`;
- EUR, monthly;
- €49/month;
- three included seats;
- €9 extra-seat price;
- intro-price expiration at activation plus 12 months;
- Planning as the included commercial module.

Verify read-only that:

- exactly one current primary subscription exists;
- provider references remain NULL;
- seat limit is three before extra seats;
- the Planning grant has source `commercial` and references that subscription;
- existing independent grants and suspensions remain unchanged;
- Field Service and AICS still return `MODULE_NOT_RELEASED`;
- expected commercial activation audit events exist.

The activation path is operator-authorized, company-scoped, audited and
fail-closed. It does not depend on fabricated Stripe objects.

### STOP and rollback boundary

The database operation is one transaction and is idempotent. A repeated call on
the same exact active contract returns `already_active` without changing the
intro period or duplicating grants/audit transitions. Any conflict, capacity
overflow, missing plan, unknown project identity or partial result is a STOP:
preserve evidence and escalate. There is no manual SQL rollback. Future
cancellation, suspension and reactivation remain separate lifecycle decisions.

## 8. Seat operations

Included capacity is **three total users, including the owner**. Usage includes
active memberships and valid pending invitations.

Use the normal owner-only UI/RPC flow for:

- inviting an employee or technician;
- accepting an invitation;
- revoking a pending invitation;
- changing a non-owner role;
- removing a non-owner member.

The owner cannot be invited, demoted or removed. Never bypass capacity with SQL.

When capacity is reached, explain the limit and record an additional-seat request;
do not silently create an extra seat. A downgrade request must be reviewed against
current members and pending invitations before any future commercial change.

## 9. Module verification

For each activation, perform a read-only verification:

| Module | Expected result |
| --- | --- |
| Core | AVAILABLE for a valid company member |
| Planning | AVAILABLE only after valid commercial/entitlement provisioning |
| Field Service | DENIED / `MODULE_NOT_RELEASED` |
| AICS | DENIED / `MODULE_NOT_RELEASED` |

Do not instruct an operator to mutate grants manually. A grant cannot override a
module that remains planned.

## 10. First-login acceptance

Run this checklist after activation without creating quotes, invoices, customers,
planning events or other business records:

- [ ] Login works through the normal FlowOS path.
- [ ] Tenant context is the approved company.
- [ ] Company profile is accessible.
- [ ] Customers is accessible.
- [ ] Catalog is accessible.
- [ ] Quotes is accessible.
- [ ] Invoices is accessible.
- [ ] Planning is visible and opens when entitled.
- [ ] Field Service is unavailable.
- [ ] AICS is unavailable.
- [ ] No unexpected console or runtime error is present.

If any check fails, stop onboarding and preserve the request/error ID.

## 11. Manual support intake

For 1–5 companies, support is a manual process. Capture:

- company and affected user;
- timestamp and timezone;
- route/page and action attempted;
- expected and actual behavior;
- safe screenshot where appropriate;
- request/error ID if visible;
- severity;
- whether data or security may be involved.

Never request passwords, JWTs, session cookies, API keys, raw tokens or full
customer documents. Use [pilot-support.md](./pilot-support.md) and
[incident-response.md](./incident-response.md) for the existing triage rules.

## 12. Support severity and communication

| Severity | Definition | Immediate action | Escalation and communication |
| --- | --- | --- | --- |
| SEV-1 | Security/data-isolation issue, broad outage or data-loss risk. | Stop affected customer operations, preserve evidence and pause changes. | Escalate to CEO/privacy owner immediately; provide factual status only. |
| SEV-2 | Major customer workflow unavailable without a reasonable workaround. | Confirm scope, check health/logs and stop risky retries. | Escalate to CEO/technical operator; communicate known impact and next update. |
| SEV-3 | Limited defect with a workaround. | Record reproduction and workaround. | Track in support queue and communicate the workaround. |
| SEV-4 | Question, cosmetic issue or feature request. | Answer or record for review. | No incident escalation; no roadmap promise. |

These are internal operating targets, not contractual SLAs. Do not promise legal
deadlines, recovery times or provider delivery guarantees that are not approved.

## 13. Stop customer operations if

**STOP CUSTOMER OPERATIONS IF:**

- cross-tenant exposure is suspected;
- unauthorized module access is suspected;
- an unexplained destructive data change occurs;
- backup/recovery state is uncertain during a destructive operation;
- production database identity is uncertain;
- the migration ledger does not match the canonical release;
- an entitlement bypass is observed;
- a credential may be compromised;
- an unknown production mutation is detected;
- release or deployment identity cannot be proven.

Preserve evidence, avoid speculative fixes and escalate through the incident
runbook. Do not perform broad cleanup or unreviewed SQL.

## 14. Health procedure

For 1–5 customers, manual checks are acceptable; no new dashboard is required.

1. Check `/api/health` and record HTTP status plus `status`, `app` and `database`.
2. Check the UptimeRobot state.
3. Check the Vercel deployment identity and relevant runtime logs.
4. Check Supabase project health and relevant logs without reading secrets or customer content.

| State | Meaning | Action |
| --- | --- | --- |
| GREEN | Health is 200/OK, deployment is known and no relevant incident exists. | Continue controlled operations. |
| AMBER | Degraded signal, uncertain log evidence or non-critical support issue. | Pause risky changes, investigate and inform the operator. |
| RED | Health failure, unknown deployment, security concern or data-integrity concern. | Stop customer operations and invoke incident response. |

## 15. Audit investigation

Use existing audit data, preferably read-only, to answer questions about:

- membership additions, removals and role changes;
- invitations and revocations;
- entitlement changes;
- quote and invoice actions;
- system-generated changes.

There is no operator audit UI. Supabase/database inspection is currently an
operator-only diagnostic process. Filter by exact company, actor, target, action
and time window. Never perform broad production cleanup while investigating.

## 16. Change and release procedure

The safe sequence remains:

`local → tests → staging → acceptance → CTO GO → production baseline → canonical migration → integrity verification → deployment → health → authenticated smoke`

Apply these rules:

- use exact migration IDs;
- stop on unexplained timestamp drift;
- do not manually patch when a canonical migration fails;
- use exact-ID cleanup only for controlled staging fixtures;
- prohibit production synthetic data unless explicitly approved;
- do not force-push, rebase or rewrite approved release history.

## 17. Quick incident actions

1. **Application outage:** stop onboarding; check `/api/health`, Vercel deployment and logs; follow the deployment rollback runbook.
2. **Database outage:** stop writes; verify Supabase project health; do not improvise a restore.
3. **Authentication failure:** preserve request IDs; do not reset unrelated users or disable Auth controls.
4. **Suspected tenant-data exposure:** stop operations immediately; preserve evidence; escalate as SEV-1/privacy incident.
5. **Incorrect authorization:** stop the affected route/module; capture tenant, actor and request ID; do not bypass RLS.
6. **Accidental deletion:** stop further changes; preserve audit evidence; recovery is unavailable until BR1 is proven.
7. **Failed deployment:** stop customer onboarding; verify commit/deployment identity; use the approved rollback process.
8. **Module accidentally exposed:** revoke traffic/entitlement only through an approved controlled path; do not release a planned module.
9. **Compromised secret:** stop use, preserve evidence and rotate through the approved secret process; never record the secret.
10. **Billing/payment dispute:** pause commercial changes, record the dispute and escalate to CEO; do not fabricate Stripe state.

Refer to [incident-response.md](./incident-response.md) for the full incident
procedure rather than duplicating technical recovery instructions here.

## 18. Backup and recovery boundary

Until a BR1 production backup, encrypted offsite copy and isolated restore drill
all pass:

**REAL CUSTOMER DATA = PROHIBITED**

Also prohibited:

- destructive customer-support operations;
- recovery guarantees;
- unproven restoration claims;
- production data deletion used as a test.

Follow [backup-restore.md](./backup-restore.md). BR1 tooling is preparation only;
it is not proof of a real production backup or restore.

## 19. Offboarding

Cancellation does not automatically delete customer data. For cancellation,
export, deletion, retention or privacy requests:

1. identify the request and company;
2. preserve the audit trail;
3. confirm legal/retention status with the privacy owner;
4. record the approved next action;
5. use only an approved, exact-scope procedure.

Until ZC2.5 and legal retention design are approved:

- **NO AD-HOC PRODUCTION DELETE**;
- no wildcard, `LIKE` or `ILIKE` cleanup;
- no broad SQL delete;
- no backup rewrite per record.

Offboarding automation is missing and must be marked as such.

## 20. Customer data requests

Use a manual intake for access, correction, export/portability, deletion and
restriction/objection requests where applicable. Route each request to the
privacy owner and preserve the audit trail.

Do not claim statutory deadlines unless already approved in repository legal
documentation. Export and deletion automation are missing; do not promise them as
self-service capabilities.

## 21. Solo-operator continuity

The CEO currently owns support, privacy, recovery and technical operation. This
is a key-person risk requiring mitigation, not an absolute blocker for customer
#1.

Before and during Early Access:

- document the access inventory without recording secrets;
- document recovery methods safely;
- verify domain, Vercel and Supabase ownership;
- keep an emergency procedure available;
- identify a second technical backup owner as soon as practical.

Do not require hiring an employee before customer #1. Do not place credentials in
this runbook.

## 22. Daily and weekly cadence

While Early Access customers are active:

**Daily**

- health status;
- failed customer reports;
- security and incident review.

**Weekly**

- backup status and BR1 evidence;
- dependency/security status;
- unresolved support items;
- audit anomalies;
- customer onboarding and offboarding status.

Keep the cadence lightweight; it must produce evidence, not bureaucracy.

## 23. Customer operational record template

Copy this template per approved company. It must remain non-sensitive:

```text
Company:
Primary contact:
Activation date:
Intro-price end:
Included seats: 3
Extra seats:
Enabled released modules:
Support status:
Legal acceptance recorded:
Backup gate at activation:
Onboarding completed:
Open incidents:
Cancellation status:
```

Never add passwords, tokens, payment-card data, JWTs or API keys.

## 24. Early Access limitations

Customers must be told that this is Controlled Early Access:

- Field Service is not included;
- AICS is not included;
- provider automation may be disabled;
- billing may initially be handled manually only after an approved activation path exists;
- functionality may evolve during Early Access.

Do not promise unapproved roadmap dates, live AI, automatic email, payment
automation, calendar integrations, RPO/RTO or legal/compliance outcomes.

## 25. Current blocked capabilities

The following are intentionally not worked around in this documentation phase:

- real production backup and isolated restore proof (BR1);
- legal/company/privacy approval;
- commercial cancellation, suspension and reactivation lifecycle (future ZC1.10 scope);
- Planning provisioning for a new commercial tenant;
- offboarding/export/deletion implementation (ZC2.5);
- second technical/support operator;
- operator audit dashboard.

These are explicit gates, not invitations to use direct SQL or provider
activation.

## 26. Review and acceptance

This document was reviewed against the ZC2.1 reconnaissance findings. Every
customer-#1 blocker is either a mandatory gate in Section 4, explicitly deferred
in Sections 7, 18, 19 or 25, or classified as a non-blocking manual process for
the 1–5 customer scale.

This runbook update documents the ZC2.3 operator procedure. It does not
authorize a production activation by itself, enable Stripe/providers, perform a
database write or authorize ZC1.10. A customer activation still requires every
Section 4 gate to be PASS.
