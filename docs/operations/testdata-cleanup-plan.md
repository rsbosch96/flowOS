# Test-data and cleanup plan

## Current position

The development project contains recognizable `ZZZ-OR2E-A` and `ZZZ-OR2E-B` fixtures. They are intentional RC1 regression fixtures and must not be copied into the external-pilot production project.

## Policy

- Keep these fixtures in development/staging for future tenant-isolation and rate-limit regression tests.
- Create a clean, separate production Supabase project for the external pilot.
- Populate production only through the approved onboarding flow with pilot-owned data.
- Do not automatically hard-delete invoices, invoice items, audit logs or numbered records: immutability, audit and counter effects must be assessed first.
- Let signed URLs expire naturally. Remove expired rate-limit windows only through the existing cleanup runbook.

## If the current project is ever repurposed

Stop and obtain an explicit CEO-approved cleanup plan. First inventory foreign keys, immutable invoice/audit records, storage objects and user membership. Do not run a broad delete or reset.

