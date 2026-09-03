# ZC1.8B — Seats & invitations

ZC1.8B adds tenant-scoped invitations without changing Core financial or
module-entitlement behavior. The company row is the serialization boundary
for seat-consuming operations. Capacity is the current commercial
subscription's `included_seats` plus active `extra_seat` items; usage is
memberships plus valid pending invitations.

Invitations are employee- or technician-only. Membership creation occurs only
through authenticated invitation acceptance; the legacy direct member-add RPC
is no longer executable by authenticated clients. Invitation rows contain
only a SHA-256 token hash. A raw token is returned once by the trusted server
RPC and is never persisted or logged. Because Resend is disabled, a one-time
token is exposed only when `FLOWOS_INVITATION_TOKEN_MODE=staging` and the
deployment is not production. Production without a delivery adapter therefore
fails closed without exposing a token.

No Stripe, Resend, entitlement grant, provider integration, or automatic
invitation email is introduced by this phase.
