# Production configuration checklist

Status: required before an external pilot. This checklist is deliberately configuration-only; it does not authorize a deployment.

## Environment separation

Use three separate environments. Do not reuse the current development Supabase project, which contains RC1/OR2E fixtures, as the external-pilot production environment.

| Environment | Supabase project | Hosting | Data | AI / mail / payments |
| --- | --- | --- | --- | --- |
| Local development | current development project or local Supabase | `next dev` | synthetic only | `AI_MODE=mock`; external integrations disabled |
| Staging | separate non-production project | Vercel preview | synthetic only | mock; mail, Stripe and OpenAI disabled |
| Pilot production | separate production project | Vercel production | pilot data only | mock; mail and Stripe disabled for this pilot |

## Hosting recommendation

Use Vercel with the Git repository connected, `main` as the production branch, and a paid commercial plan before an external commercial pilot. Vercel is the smallest operational fit for this Next.js application; do not introduce a self-managed Node server for this release.

Before deployment, the CEO must provide and verify a production domain. Add the domain to Vercel and add the exact production callback URL to Supabase Auth:

```text
https://<pilot-domain>/auth/callback
```

Preview callback URLs may be added only for the staging/preview host and must never point at production data.

## Required production environment variables

Set these only in Vercel's encrypted server/environment settings. Never commit them, expose them with `NEXT_PUBLIC_`, or copy values into tickets or logs.

```text
NEXT_PUBLIC_SUPABASE_URL=<production-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production-anon-key>
SUPABASE_SECRET_KEY=<production-server-secret>
AI_MODE=mock
AI_PROVIDER=openai
AI_MODEL_QUOTE=<configured-default-model>
```

`SUPABASE_SERVICE_ROLE_KEY` may be used instead of `SUPABASE_SECRET_KEY` only if the deployment uses that naming convention. Set one server-only admin credential, not a public credential.

For this pilot, leave the following variables absent in production so the application cannot accidentally initiate a paid/external action:

```text
OPENAI_API_KEY
RESEND_API_KEY
EMAIL_FROM
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER
```

If a later release enables real AI, mail or Stripe, use a separate reviewed change and add only its required configuration.

## Supabase production baseline

1. Create a new Supabase production project in the approved region.
2. Apply the reconciled migration ledger using the documented procedure; never use a blind `db push` against production.
3. Verify the migration ledger, RLS, private Storage buckets and policies before importing pilot data.
4. Configure the production redirect URL and site URL in Supabase Auth.
5. Create only pilot users/companies in production; do not copy `ZZZ-OR2E-*` fixtures.
6. Confirm Storage buckets `company-documents` and `company-images` are private and retain their configured MIME/size restrictions.

## Configuration verification

Before every production deployment:

- [ ] `npm ci`, typecheck, lint, tests and build are green in CI.
- [ ] Production and staging have different Supabase URLs and admin secrets.
- [ ] Production has `AI_MODE=mock`.
- [ ] No OpenAI, Resend or Stripe secrets are configured for this pilot.
- [ ] `/api/health` returns `200` after deployment.
- [ ] `NEXT_PUBLIC_*` variables contain only intended public values.
- [ ] Supabase redirect/site URLs match the production domain.
- [ ] A backup export and restore drill exist as documented in [backup-restore.md](./backup-restore.md).

