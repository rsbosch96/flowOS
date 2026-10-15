# FSAT-001A — Full-System Acceptance Test Master Plan

Status: DESIGN DRAFT — READY FOR CTO REVIEW
Scope: read-only test design; no staging or production execution

## Purpose and boundaries

FSAT-001A defines the evidence needed before a controlled early-access launch. It does not execute the tests, authorize customer activation, or change application behavior. All execution must use synthetic fixtures, exact fixture IDs, and an independently verified environment target.

Hard boundaries:

- production Supabase `ivifmemxvgglvnnarubt` is never a test target;
- staging Supabase `lkmzwhbbffppyiiiyswk` is read-only during this design phase;
- OpenAI, Resend, Stripe, Google Calendar and Microsoft Calendar remain disabled;
- no migrations, deployments, backup exports, restores, or real-customer data;
- BR1 real backup/restore proof remains open and is a launch blocker.

## Evidence baseline to verify at execution start

The runner must record the actual branch, commit, `origin/main`, worktree status, and environment target. Prior planning evidence is not substituted for a fresh execution record. The current repository evidence includes ZCF-001 documentation, BR1.2A local recovery tooling, and the STG-002 staging ledger reconciliation; those are inputs to the test plan, not proof that FSAT has passed.

## System inventory and release states

| Area | Expected state | Acceptance evidence |
|---|---|---|
| Authentication and onboarding | Available | normal login, protected route, tenant context |
| Company, customers, catalog | Available | tenant-scoped CRUD/read checks with synthetic data |
| Quotes and public acceptance | Available | draft → send/share → accept/reject, token safety |
| Invoices and PDF | Available | immutable snapshot and valid PDF |
| Planning | Available | tenant-scoped read/write and entitlement behavior |
| Field Service | Planned/denied | unavailable until separately released |
| AI quote assistance | Mock/disabled | no live AI call; human review boundary |
| AICS | Planned/denied | no provider activation; review/handoff controls only when released |
| Team, seats and invitations | Implemented; delivery disabled | role/seat/RLS checks and honest manual handoff wording |
| Entitlements and activation | Implemented; operator activation disabled | deny-by-default and audit evidence |
| Monitoring/support | Documentation and monitoring available | incident, rollback and support tabletop evidence |
| Backup/recovery | Preparation only | BR1 proof remains open until real isolated restore |

## Execution phases

1. **Preflight:** capture commit, environment identity, provider flags, fixture allowlist and baseline counts.
2. **Core functional pass:** execute matrix FSAT-001A-01 through -16 with synthetic tenant data.
3. **Security/concurrency pass:** run RLS, tenant isolation, role, seat and concurrency scenarios using independent sessions.
4. **Reliability pass:** health checks, rollback rehearsal in a non-production environment, idempotency and failure injection where already supported.
5. **Provider-cost pass:** prove disabled providers are not invoked and no paid service is enabled.
6. **Evidence review:** reconcile logs, audit events, counts and cleanup; classify every failed or unexecuted gate.

## Automation and integration map

| Workflow | Trigger → boundary → result | External side effect | Required FSAT evidence |
|---|---|---|---|
| AI quote draft | authenticated request → tenant/catalog authorization → mock/provider gateway → draft + AI run | none in mock; live provider forbidden in this phase | catalog grounding, draft state, safe failure, no auto-send |
| Public quote | owner publishes → hashed public token → customer decision → audited quote state | optional email remains disabled | token revocation, one decision, no internal IDs |
| Invoice | accepted quote → tenant RPC → immutable snapshots/numbering → PDF | no payment or email | totals, VAT, numbering, snapshot immutability |
| Invitation | owner UI → seat/role RPC → pending invitation → manual handoff/revoke | Resend disabled; no claim of delivery | seat race, role restrictions, honest wording, audit |
| Entitlements | operator-controlled grant/suspension → resolver → route/RLS/module guard | no automatic activation | effective state and deny-by-default |
| AICS | inbound conversation → classification → draft → human review/takeover | no automatic outbound message | stale takeover conflict, audit cardinality, no-auto-send |
| Field Service | released entitlement → work-order RPCs → append-only execution evidence | providers not required | lifecycle, tenant isolation, planned-state denial |
| Monitoring/support | health/incident trigger → runbook/structured logger → operator evidence | no automatic customer communication | redaction, rollback/tabletop evidence |
| Recovery | approved backup artifact → isolated restore → invariant smoke | BR1 real drill not yet executed | checksums, Auth method, RPO/RTO and kill-switch evidence |

Missing or unproven automation is recorded as NOT IMPLEMENTED or BLOCKED; a provider name in documentation is never treated as an active integration.

## Required evidence format

Each scenario records prerequisites, exact synthetic IDs, steps, expected and negative outcomes, evidence paths, cleanup result, dependencies, duration estimate, criticality, automation potential and status `NOT RUN` until executed.

## Go/no-go rule

FSAT can recommend early access only when all mandatory rows are PASS, all unexecuted rows have an explicit approved waiver, BR1 real backup/restore proof is complete, legal/privacy review is closed, and customer activation is explicitly authorized. A clean local test suite alone is not sufficient.

## Data and cleanup contract

Every created fixture receives a `run_id` and explicit IDs are recorded before mutation. Cleanup uses an allowlist, expected row counts, a hard maximum and a transaction; wildcard/prefix deletion is prohibited. Unexpected rows fail closed and are reported instead of deleted.
