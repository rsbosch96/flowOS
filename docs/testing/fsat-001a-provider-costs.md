# FSAT-001A — Provider, Cost and Safety Matrix

FSAT-001A is a design document. No provider is activated and no paid service is enabled by creating it.

| Capability | Current expected state | FSAT proof | Cost rule |
|---|---|---|---|
| Supabase database/Auth | Active infrastructure | target identity, RLS and health checks | no plan change in FSAT |
| Vercel | Active hosting | deployed commit and logs where accessible | no deployment in FSAT design |
| UptimeRobot | Active monitoring | monitoring evidence/runbook | no monitor change |
| OpenAI/live AI | Disabled; mock only | zero live requests and safe config | no key or paid call |
| Resend/email | Disabled | UI says created/manual handoff, never sent | no mailbox/provider activation |
| Stripe | Disabled | no checkout/webhook/provider calls | no account or charge |
| Google/Microsoft Calendar | Disabled | no OAuth/provider calls | no OAuth consent |
| R2/object storage | Not executed | local/mock tooling only until BR1 approval | no bucket, upload or transfer |
| Supabase Pro/recovery project | Not approved | BR1 remains open | no upgrade or recovery project |

## Budget scenarios (planning estimates, not price quotes)

| Scenario | Scope | Expected FSAT spend | Decision |
|---|---|---:|---|
| €0 baseline | local tests, existing staging, mock providers, documentation | €0 | current approved plan |
| Controlled test | only if CTO later approves sandbox mailbox/provider or isolated recovery | UNKNOWN until vendor quote | stop and obtain explicit approval |
| Full recovery proof | managed backup/restore capacity, offsite encrypted copy and isolated project | UNKNOWN; likely paid | BR1 customer-data gate, not part of FSAT-001A |

No current pricing is asserted here. A hard spend cap must be supplied by the CEO/CTO before any paid test is scheduled; until then the cap is €0 and every paid prerequisite is BLOCKED.

## Cost stop conditions

Stop before execution if any test requires a paid plan, provider activation, mailbox, recovery project, production export, or external service. Optional improvements are not silently converted into launch blockers; only contractual safety and evidence gates are mandatory.

## Logging requirement

Provider and cost evidence must contain only safe metadata: provider category, route, timestamp, request/run ID and normalized outcome. Never record keys, tokens, passwords, raw prompts, private email content or full customer data.
