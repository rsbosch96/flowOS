# DATA-LOC-001 — verified data-location record

This is an engineering inventory, not legal advice. Legal and CEO decisions
remain open before customer launch.

| Environment | Supabase region | Status |
| --- | --- | --- |
| Production | `eu-west-2` / London | reported current architecture |
| Staging | `eu-west-1` | reported current architecture |

Production is outside the EEA. The adequacy/transfer basis, controller or
processor role, and any required contractual safeguards must be confirmed by
the legal reviewer before launch.

Potential data categories include account identity, company membership,
customer contact details, quotes, invoices, Planning records, audit metadata,
and private Storage objects. Current subprocessors and their locations are
tracked in `docs/legal/subprocessors.md` and require legal review.

Moving production to another region is not technically required by this
record; it is a CEO/business/legal decision. No region or infrastructure was
changed by this sprint.
