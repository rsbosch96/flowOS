# Pilot GO / NO-GO checklist

## Functional scope

**Functional pilot scope is frozen.** Only security fixes, operational fixes and documentation corrections are permitted before pilot. New product features require a post-pilot decision.

## GO criteria

### Environment and deployment

- [ ] Separate production Supabase project exists; it contains no RC1/OR2E fixtures.
- [ ] Separate staging/test environment exists with synthetic data.
- [ ] Commercial hosting, production domain and Supabase Auth URLs are configured.
- [ ] Production configuration checklist is complete.
- [ ] CI quality gates passed for the deployment commit.

### Data safety and operations

- [ ] Manual encrypted database and Storage backup completed.
- [ ] Synthetic restore drill completed and recorded.
- [ ] Health monitoring/alert contact tested.
- [ ] Incident owner and pilot support contact are assigned.
- [ ] Migration ledger matches the approved production schema.

### Product restrictions and legal

- [ ] `AI_MODE=mock` confirmed; no OpenAI key in production.
- [ ] Resend and Stripe credentials absent; no automatic e-mail/payment is promised.
- [ ] Privacy notice, terms, DPA and retention choices are legally reviewed, completed with company/contact details, and published where appropriate.
- [ ] Pilot company acknowledges the test/pilot boundaries and support contact.

### Final release validation

- [ ] Staging smoke test passed.
- [ ] Production post-deploy smoke test passed with synthetic/authorized test data.
- [ ] No unresolved tenant-isolation, invoice-integrity, public-token or health-check incident exists.

## NO-GO triggers

Do not invite an external pilot if there is no separate production environment, no proven backup/restore path, no assigned support/privacy contact, no reviewed legal basis, or any unresolved cross-tenant/security issue.

## Decision record

| Item | Decision | Owner | Date | Evidence |
| --- | --- | --- | --- | --- |
| Go / no-go | `[GO / NO-GO]` | CEO | `[date]` | `[link]` |
| Backup/restore drill | `[pass/fail]` | Operations | `[date]` | `[link]` |
| Legal review | `[approved/pending]` | CEO/legal | `[date]` | `[link]` |

