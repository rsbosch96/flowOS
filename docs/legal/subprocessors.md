# CONCEPT — LEGAL REVIEW RECOMMENDED BEFORE COMMERCIAL LAUNCH

# Subprocessor register

This register distinguishes code present in FlowOS from services active in the PRR1 pilot. CEO/legal must confirm contractual terms, regions and transfer safeguards before enabling or publishing the final register.

| Provider | Service/purpose | Pilot status | Data categories | Location/transfer status |
| --- | --- | --- | --- | --- |
| Supabase | Auth, PostgreSQL database, private Storage | active infrastructure | account, business/customer, quote/invoice, document and audit data | connected project: EU region (`eu-west-1`); contract review required |
| Vercel | intended Next.js hosting | not yet provisioned | runtime requests and technical logs after activation | CEO/legal confirmation required |
| OpenAI | AI quote generation | not active; pilot is mock-only | would receive prepared quote input if later enabled | legal/DPA/transfer review required before activation |
| Resend | transactional e-mail | not active for pilot | would receive recipient/delivery content if enabled | legal/DPA/transfer review required before activation |
| Stripe | subscriptions/payments | not active for pilot | would receive billing/payment data if enabled | legal/DPA/transfer review required before activation |
| GitHub | source control/CI | development infrastructure; not an application runtime processor by current evidence | source/configuration metadata; no pilot customer data intended | CEO/legal confirmation required |

No raw public quote token is intentionally retained in application database, delivery metadata or audit logs.

