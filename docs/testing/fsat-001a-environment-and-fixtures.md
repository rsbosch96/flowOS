# FSAT-001A — Environment and Fixture Contract

## Environments

| Environment | Project | Use in FSAT-001A |
|---|---|---|
| Staging | `lkmzwhbbffppyiiiyswk` | synthetic execution target after separate approval |
| Production | `ivifmemxvgglvnnarubt` | hard deny; never a test target |

Environment identity must be checked independently for REST/Auth and SQL before any write. A CLI linked-project setting is not sufficient evidence. A production project ID appearing in any write target is an immediate stop condition.

## Fixture model

Use one dedicated synthetic company and explicitly registered owner, non-owner, customer, catalog item, quote, invitation, entitlement and (only if approved) AI conversation fixtures. No existing ZZZ tenant, real person, real mailbox or production-derived row may be reused.

Required fixture metadata:

- `run_id` generated for one test run;
- exact table row IDs and Auth user IDs;
- fixture type and intended scenario;
- creation timestamp and owner;
- cleanup status.

## Baselines

Before mutation record counts and relevant IDs for companies, memberships, customers, catalog items, quotes, invoices, planning events, invitations, subscriptions, subscription items, entitlement grants/suspensions, audit events and outbound delivery records. After cleanup, compare to the baseline and retain only approved audit evidence.

## Authentication

Use the normal FlowOS authentication flow. Temporary passwords are generated at runtime, never committed, printed, logged or included in screenshots. Service-role access, where separately authorized for fixture provisioning, is never used as the browser identity. No JWT fabrication or SSO bypass is permitted.

## Cleanup and stop conditions

Cleanup is exact-ID only, transactionally bounded and fail-closed. Stop if a row is not on the allowlist, counts exceed the expected maximum, a cross-tenant relation appears, or a provider/network target cannot be proven safe. Never reset existing user passwords or delete historical synthetic data outside the run allowlist.
