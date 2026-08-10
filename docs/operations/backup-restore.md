# Backup and restore runbook

## Purpose and ownership

Owner: CEO or delegated operations owner. Frequency: before pilot go-live, then weekly during the pilot and before every material schema/configuration change.

The connected Supabase organization is currently on the Free plan. Do **not** assume scheduled daily database backups or point-in-time recovery are available. Treat manual, encrypted exports as mandatory until the CEO explicitly approves a plan with managed backup/PITR coverage.

Supabase database backups and `db dump` do not restore Storage objects. Database and Storage must therefore be backed up and restored as separate tracks. Reference: [Supabase backups](https://supabase.com/docs/guides/platform/backups).

## Backup procedure

1. Confirm the target is the correct environment and record project reference, operator, UTC timestamp and migration ledger version.
2. Export the database using the approved Supabase CLI procedure, storing the output outside the repository in encrypted access-controlled storage.
3. Export a schema-only dump separately and record its checksum.
4. Export a Storage inventory for the private buckets `company-documents` and `company-images` (bucket, object path, size, timestamp, checksum where available).
5. Export the permitted Storage objects to the same encrypted backup location. Do not place raw public quote tokens, credentials or service keys in the manifest.
6. Record the backup location, encryption owner and retention expiry in the operations log. Do not log customer document contents.
7. Retain at least two rotating successful backup sets until legal/CEO retention policy is approved.

## Restore procedure

Never restore over the live pilot environment as a first response. Restore to an isolated recovery project first.

1. Declare an incident and freeze deployments/migrations.
2. Identify the last known-good backup and verify checksum and access controls.
3. Create an isolated Supabase recovery project in the same approved region.
4. Apply the approved schema/migration baseline only if it is required by the restore procedure; record every action.
5. Restore the database dump.
6. Restore Storage objects from the object manifest, preserving bucket and object paths.
7. Verify row counts, migration ledger, RLS, private buckets, critical RPCs, `/api/health`, and a non-destructive smoke test.
8. Obtain CEO approval before any cutover. Rotate affected credentials/tokens if compromise is suspected.
9. Document recovery point, recovery time, data loss window and follow-up actions.

## Restore drill before pilot

A restore drill is a hard go-live condition. Complete it with synthetic data and record:

- backup creation time and checksum;
- successful database restore;
- successful Storage inventory/object restore;
- RLS and health verification;
- elapsed recovery time;
- any manual steps.

## Limitations and decisions required

- Free-plan managed backup/PITR coverage is not proven; CEO must accept manual exports or approve a suitable Supabase plan before launch.
- Storage restore is manual until an approved automated process exists.
- Backup retention and storage location require CEO/legal approval; see [data-retention.md](../legal/data-retention.md).

