# CONCEPT — LEGAL REVIEW RECOMMENDED BEFORE COMMERCIAL LAUNCH

# Privacy statement for FlowOS pilot

Last updated: `[date]`  
Controller: `[legal entity name, address, KvK number]`  
Privacy contact: `[privacy email]`

This concept describes the intended handling of personal data in the FlowOS pilot. It is not legal advice and must be completed and approved by counsel before publication or commercial use.

## What FlowOS processes

FlowOS may process user-account data, company profile information, customer contact and address data, conversations/requests, quotes, invoices and their snapshots, uploaded documents, product data, audit/security events and technical usage metadata. Processing is limited to providing the quote-to-invoice workflow, security, support and legal obligations.

The current pilot keeps AI in mock mode. No real OpenAI request is intended. Automatic e-mail and Stripe payments are disabled for the pilot. If any of those services are enabled later, this notice and the subprocessors list must be reviewed first.

## Roles and purposes

For customer/business data entered by an installation company, the installation company will normally be the controller and FlowOS operator normally the processor. For its own account, billing, security and support administration, the FlowOS operator may be controller. The exact roles and legal bases require legal confirmation.

## Recipients and locations

Active application infrastructure includes Supabase for authentication, database and private file storage. Intended production hosting is Vercel, once provisioned. See [subprocessors.md](./subprocessors.md) for status and required review. No raw public quote token is stored as a database value; only a hash is used for lookup.

## Retention, security and rights

Retention is governed by the proposed schedule in [data-retention.md](./data-retention.md), subject to legal approval. FlowOS applies tenant isolation, role controls, private Storage buckets, hashed public-link tokens, audit logging and rate limiting. No system can guarantee absolute security.

Data subjects may use `[privacy email]` for access, correction, deletion, restriction, objection or portability requests. The operator will verify authority before responding and coordinate processor requests with the relevant installation company.

## Changes and incidents

Material changes will be communicated through `[channel]`. Suspected personal-data incidents are handled through the internal incident procedure and escalated to the controller/legal advisers as required.

