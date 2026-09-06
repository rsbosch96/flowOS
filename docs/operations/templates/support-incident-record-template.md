# Support / incident record template

Copy this template to a secure manual register. Do **not** commit completed customer records to Git or public issue trackers.

## Record

- Reference: `SUP-YYYYMMDD-###` or `INC-YYYYMMDD-###`
- Opened at (UTC):
- Closed at (UTC):
- Environment:
- Company/tenant:
- Reporter:
- Contact:
- Owner:
- Severity: SEV-1 / SEV-2 / SEV-3 / SEV-4
- Affected area/route:
- Summary:
- Business impact:
- Security/privacy suspicion: yes / no / unknown
- Status: reported / acknowledged / triaged / investigating / mitigated / resolved / closed
- Request-ID(s):

## Evidence and timeline

- Reproduction:
- Timeline:
- Diagnostic evidence (links/identifiers only):
- Customer updates:

## Response

- Mitigation:
- Root cause (only when proven):
- Recovery validation (`/api/health` 3x and authenticated read-only smoke where applicable):
- Follow-up actions and owner:
- Closure evidence:

## Redaction rules

Never store passwords, session tokens, JWTs, API keys, raw invitation/quote tokens, unnecessary full customer documents or unnecessary personal data. Do not store production customer content in Git or public issue trackers. Keep evidence exact-scope, access-controlled and minimal.
