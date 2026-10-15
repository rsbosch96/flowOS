# FSAT-001A — Test Matrix

Legend: `DESIGN` means the scenario is specified but not executed by FSAT-001A. Execution results must be recorded as PASS, FAIL, BLOCKED or WAIVED with evidence.

| ID | Scenario | Expected result | Evidence required | Risk |
|---|---|---|---|---|
| FSAT-001A-01 | Login and tenant bootstrap | authenticated session resolves one permitted tenant | request IDs, tenant/member IDs, no tokens | High |
| FSAT-001A-02 | Role boundaries | owner, employee and technician receive only designed controls | UI/API result and denial evidence | High |
| FSAT-001A-03 | Company/customer/catalog isolation | records remain within the selected company | before/after counts and IDs | High |
| FSAT-001A-04 | Quote lifecycle | create, edit, send/share, accept and reject follow state machine | quote audit and public-token state | High |
| FSAT-001A-05 | Public acceptance | token grants only intended public view/action and is revocable | response/status and no cross-tenant access | High |
| FSAT-001A-06 | Invoice/PDF | immutable financial snapshot and valid PDF | totals, hash/metadata and HTTP result | High |
| FSAT-001A-07 | Planning | authorized users can use Planning; denied tenants cannot bypass entitlement | route and authorization evidence | Medium |
| FSAT-001A-08 | Team/invitations | roles are limited to employee/technician; delivery wording is honest; revoke is idempotent | invitation row/audit and UI capture | High |
| FSAT-001A-09 | Seats and entitlements | capacity boundary rejects excess grant without raw DB/RPC details | concurrent results and audit cardinality | High |
| FSAT-001A-10 | AI safety | mock mode is explicit; no live AI/provider call; human review is required | config, logs and audit evidence | High |
| FSAT-001A-11 | AICS boundary | planned/disabled state is enforced; no accidental customer reply | route/entitlement denial and outbound count | High |
| FSAT-001A-12 | Field Service boundary | planned/denied state is enforced; no activation side effect | route/entitlement denial | Medium |
| FSAT-001A-13 | Error and secret hygiene | errors are generic to users; logs contain no passwords, tokens or raw provider payloads | redacted log sample and UI assertions | High |
| FSAT-001A-14 | Concurrency and idempotency | competing mutations produce one valid winner and no false success | independent DB connections and exact audit counts | High |
| FSAT-001A-15 | Health/reliability | health is green; safe retry/rollback procedures are documented | 3x health and runbook evidence | Medium |
| FSAT-001A-16 | Backup/recovery gate | real isolated backup and restore proof exists before customer data | immutable evidence pack, RPO/RTO measured | Critical |

## End-to-end scenario catalog (all status: NOT RUN)

| ID | Objective and minimum steps | Fixtures/evidence | Negative case | Duration / automation / criticality |
|---|---|---|---|---|
| A | Onboard synthetic company; owner logs in; verify tenant bootstrap | owner, company, membership; session and tenant evidence | wrong-tenant URL denied | 15m / high / High |
| B | Invite employee/technician, accept through normal flow, verify role | two users, invitation IDs, audit events | owner role unavailable; revoke is idempotent | 20m / medium / High |
| C | Fill seat capacity and race two invitations | subscription/seat fixture, two sessions, RPC results | no over-limit row or false success | 20m / high / Critical |
| D | Create customer and catalog items; select catalog line in quote | customer/catalog IDs and price snapshots | cross-tenant IDs rejected | 20m / high / High |
| E | Generate mock AI quote draft; human edits/approves | controlled prompt, catalog, AI run and draft | prompt injection or missing data cannot authorize/price | 25m / medium / High |
| F | Publish quote; open public link; accept/reject once | hashed token, quote audit and final state | expired/revoked token and duplicate decision denied | 20m / high / Critical |
| G | Create/update Planning event and verify entitlement guard | event ID, tenant and role | denied tenant cannot direct-call route | 20m / high / High |
| H | Create invoice from accepted quote; render PDF and verify immutable totals | invoice/PDF bytes, VAT and numbering evidence | second mutation cannot alter snapshot | 25m / high / Critical |
| I | Isolated Field Service lifecycle from create through complete | work order, technician, materials, notes, evidence | planned module cannot be reached by normal user | 30m / medium / High |
| J | AICS inbound request → classify → draft → human takeover/review | conversation, knowledge and audit IDs | stale approve/reject/edit returns safe conflict; no send | 30m / high / Critical |
| K | Commercial plan/entitlement grant, suspension and module denial | grant/suspension IDs and resolver output | client cannot self-grant or bypass suspension | 25m / high / Critical |
| L | Conditional Stripe sandbox payment/failure journey | only if provider is separately approved and implemented | no live Stripe call in this phase | 30m / low / High |
| M | Provider timeout/retry/idempotency simulation | mock failure switch, request IDs and audit | duplicate callback creates no duplicate state | 20m / high / High |
| N | Two synthetic tenants attack each other's URLs/APIs | two companies/users and exact IDs | RLS/API returns generic denial, no data | 25m / high / Critical |
| O | Restore approved backup into isolated environment; smoke login/business invariants | BR1 backup, checksums, Auth/Storage evidence | incomplete artifact or production target fails closed | 90m+ / low / Critical |
| P | Simulate operator incident and break-glass rollback | incident record, approval and rollback evidence | no unapproved production action or secret in record | 30m / medium / High |

For each row, execution must capture: request/run ID, environment, commit, timestamps, expected/observed status, audit cardinality, redacted logs, before/after counts and exact cleanup IDs. `NOT RUN` and `BLOCKED` never count as PASS.

## AI-specific acceptance measurements

These are proposed execution thresholds and require CTO approval before use; they are not current product claims.

- zero live-provider requests while `AI_MODE=mock`;
- 100% of generated quote drafts marked draft/pending human review;
- zero automatic outbound customer messages;
- zero prompt, secret, token or customer-content leakage in logs;
- deterministic, safe fallback for timeout/provider failure;
- audit event cardinality exactly equals accepted state transitions.

## Failure classification

- **P0:** production data risk, cross-tenant access, secret leakage, unauthorized provider activation or failed recovery proof.
- **P1:** broken authorization, false success, financial mutation inconsistency, or irrecoverable audit gap.
- **P2:** usability, copy, accessibility or non-critical observability defect.

Any P0/P1 blocks launch. P2 may be waived only with named owner and due date.
