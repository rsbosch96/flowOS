# Pilot smoke test

Run in staging with synthetic data before each production deployment and once in production immediately after deployment. Do not send real e-mail, call live AI or create payment charges.

## Preconditions

- [ ] Correct environment and synthetic test tenant confirmed.
- [ ] `AI_MODE=mock` confirmed.
- [ ] No Resend/Stripe production action enabled.
- [ ] Health endpoint is green.

## Core path

1. Sign in as an allowed company member. Expected: tenant dashboard opens.
2. Open company profile and catalog. Expected: only the active tenant's data is visible.
3. Create/open a conversation/request. Expected: membership checks remain enforced.
4. Generate a quote concept with mock AI. Expected: draft is created; no real provider call occurs.
5. Open and edit the draft. Expected: draft totals are recalculated server-side; non-draft quotes remain read-only.
6. Publish a synthetic approved quote and open its customer link. Expected: private, valid hash-token path works and no internal notes appear.
7. Accept or reject only a disposable synthetic quote. Expected: one valid status transition and audit record.
8. Create one invoice only when a dedicated synthetic quote is available. Expected: invoice number, snapshots, VAT details and PDF render correctly.
9. Update an allowed invoice status. Expected: only valid transitions are offered/accepted.
10. Check `/api/health`. Expected: HTTP 200 with database check `ok`.

## Security checks

- [ ] A member of tenant A cannot open/edit tenant B records by URL.
- [ ] Public invalid/expired/revoked link does not disclose quote data.
- [ ] Public rate limit displays the temporary-safe message, not a false 404.
- [ ] Product and document uploads use their separate private buckets; no actual upload is needed in this smoke test.

## Evidence

Record date/time, environment, release identifier, operator, pass/fail, request IDs for failures and screenshots without personal data or raw tokens.

