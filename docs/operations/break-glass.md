# Break-glass operator runbook

This procedure is for loss or suspected compromise of normal operator access.
It is an operational draft and does not store credentials.

## 1. Declare and preserve

Record a `SUP-` support reference and, when an incident exists, an `INC-`
reference. Freeze deployments, preserve request IDs and provider audit logs,
and do not reset or delete customer data during investigation.

## 2. Access recovery

- Recover the Supabase organization through its documented owner recovery
  process; verify the project reference before any action.
- Recover Vercel organization access through the documented owner/recovery
  process; verify the project and branch before changing deployment settings.
- Never use a shared credential or bypass MFA.
- If recovery cannot be verified, keep production unchanged and escalate to
  the CEO and legal/security reviewer.

## 3. Compromised credential response

1. Revoke the affected session/API token through the provider's supported UI.
2. Rotate the affected secret in the provider dashboard.
3. Update only the intended environment and verify the old credential fails.
4. Keep `AI_MODE=mock`; OpenAI, Resend, Stripe and calendar providers remain
   disabled unless separately approved.
5. Preserve evidence without recording secret values.

## 4. Kill switches

Disable customer activation, live AI, email, payments, calendar integrations,
and external webhooks before investigating a suspected external action. The
activation endpoint must remain operator-disabled unless a separate release
gate authorizes it.

## 5. Return to normal

Confirm the recovered operator can access only the intended project, verify
health and audit logs, document the rotation and evidence references, and have
the CEO close the incident. Do not re-enable a provider or customer
activation as part of emergency recovery.

No secrets, tokens, customer data, or provider credentials belong in Git.
