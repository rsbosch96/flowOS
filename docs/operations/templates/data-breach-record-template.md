# CONCEPT — DATLEK-/PRIVACY-INCIDENTREGISTER

Gebruik één record per incident. Vul feiten in, geen speculatie, secrets, raw
tokens, volledige documenten of onnodige persoonsgegevens.

| Veld | In te vullen |
| --- | --- |
| Incident-ID / starttijd (UTC) | `[INCIDENT_ID]` / `[UTC_TIMESTAMP]` |
| Melder / incident owner | `[ROLE OR NAME]` |
| Omgeving / systemen | `[PRODUCTION/STAGING]`, `[SYSTEMS]` |
| Technisch signaal / request-ID | `[SAFE_REFERENCE]` |
| Mogelijks persoonsgegevens betrokken? | `[YES/NO/UNKNOWN]` + feiten |
| Betrokken tenant(s) / controller | `[COMPANY_ID OR SAFE_REFERENCE]` |
| Datacategorieën / geschat bereik | `[MINIMISED_DESCRIPTION]` |
| Bevestigde oorzaak / status | `[FACTS_ONLY]` |
| Containment en evidence | `[ACTIONS_AND_REFERENCES]` |
| Subprocessor betrokken? | `[PROVIDER/STATUS]` |
| Privacy/legal beslisser | `[ROLE]` |
| Meldings- en communicatiebesluit | `[LEGAL_DECISION_REQUIRED]` |
| Tijdlijn / vervolgactie / eigenaar | `[TIMELINE]` |
| Sluiting / post-incident review | `[DATE_AND_APPROVER]` |
