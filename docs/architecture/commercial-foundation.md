# ZC1.7 — Commercial foundation

ZC1.7 adds the domain vocabulary for commercial plans without activating
payments or changing runtime module access.

## Authority model

`commercial_plans` identifies a stable offer. `commercial_plan_versions` is
an immutable catalog version: a price or included-seat change creates a new
version. A company contract is stored in the existing `subscriptions` table.
When `plan_version_id` is assigned, the subscription's snapshot fields
(`base_price_cents`, `included_seats`, `extra_seat_price_cents`, `currency` and
`billing_interval`) are the runtime commercial authority. The referenced plan
version records provenance; it does not recalculate an existing contract.

The existing legacy Stripe columns are retained for compatibility. New
commercial state is provider-neutral and supports `billing_provider = manual`
or a future reviewed provider. Stripe is never an authorization source and is
not activated by ZC1.7.

## Primary subscription and items

The existing `subscriptions` table remains the single company subscription
concept. A partial unique index permits historical cancelled rows while
allowing at most one `is_primary` subscription in an access-bearing state
(`trialing`, `active`, `past_due`, `grace_period` or `suspended`) per company.
`subscription_items` are extension records (`seat`, `module` or `addon`); the
base plan is not duplicated as an item. ZC1.7 stores these values but does not
enforce seats or invitations.

## Entitlement intent

`commercial_plan_entitlements` describes what a plan intends to include. The
Early Access version includes Planning only. It does **not** write or override
`company_module_entitlements`; existing runtime entitlements remain unchanged.
ZC1.9 will define source-aware grants and suspensions.

## Security and mutations

Plan catalog tables expose read-only catalog data. Subscription details and
items are owner-readable within the tenant. Browser roles receive no direct
commercial INSERT/UPDATE/DELETE privileges. ZC1.7 introduces no mutation
route; any future mutation must use the existing trusted server/service-role
boundary, validate company and actor scope, and write an `audit_logs` event.

Plan-version contract fields are protected by a database trigger once a
subscription references the version. Existing subscriptions are not
backfilled, converted to Early Access, or assigned a price. Nullable
transitional fields preserve unknown legacy contracts safely.

## Boundaries

ZC1.8 owns invitations and transactional seat enforcement. ZC1.9 owns
entitlement grants/suspensions. Checkout, billing portal, payment collection,
webhooks and provider credentials are out of scope. No provider is activated
and no existing entitlement, membership or financial record is changed.
