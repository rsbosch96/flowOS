# BR1.2A Recovery pipeline implementation

This phase adds local, fail-closed pipeline building blocks only. It does not
run a production backup, export Storage, upload to R2, create a recovery
project, or restore anything.

## Auth boundary

The approved Auth recovery contract is Supabase's supported managed “Restore to
a New Project” / physical-backup restore path where available. It is a
provider operation, not a repository SQL import. `restore-auth.mjs` remains
fail-closed and accepts only evidence from that managed procedure: matching
pre/post logical user and company identity, a new normal password login, and
tenant isolation. Existing sessions and refresh tokens are never recovery
evidence. Direct SQL writes to `auth` tables, custom password-hash import, and
unrelated replacement users are rejected.

Managed restore is plan-dependent and must be proven in BR1.2B. It includes
durable Auth records where Supabase documents it, but Storage object bytes and
external-action safety require separate proof.

## Components

- `backup-db.mjs`: explicit custom-format `pg_dump` planner, disabled without BR1.2B approval.
- `backup-storage-supabase.mjs`: approved-bucket/path validation and remote-export gate.
- `restore-db.mjs` / `restore-storage-supabase.mjs`: shared recovery target guards.
- `restore-auth.mjs`: fail-closed Auth decision boundary.
- `encrypt-backup-artifacts.mjs`: `age` wrapper requiring explicit execution.
- `r2-backup-transfer.mjs`: encrypted exact-key validation; no network upload in this phase.
- `retention-plan.mjs`: non-destructive exact-key planning.
- `recovery-invariants.mjs`: post-restore invariant checks.
- `recovery-external-actions.mjs`: requires an inventory of pg_cron, pg_net,
  webhooks, wrappers, integrations, and provider-triggering functions before
  any isolated managed restore.

## Artifact boundaries

The logical `pg_dump` tooling remains useful for independent encrypted copies,
integrity comparison, portability, and defense in depth. It is not the
authoritative mechanism for restoring Supabase-managed Auth internals. Database
artifacts require a custom-format manifest and SHA-256 evidence. Storage
artifacts require per-object bucket/path, byte-size, SHA-256, and tenant
authorization evidence. Only `company-documents` and `company-images` are
approved buckets. Actual remote export, byte transfer, and restore remain
BR1.2B execution prerequisites.

Recovery environments must run with `AI_MODE=mock`; OpenAI, Resend, Stripe,
calendar, and other provider credentials must be absent. External-action
inventory and provider kill-switch evidence are mandatory before recovery.

Real production backup, Storage export, R2 upload, managed restore, Auth
identity proof, and RPO/RTO remain unproven until BR1.2B. No production or
staging writes occurred during BR1.2A.
