# CONCEPT — LEGAL REVIEW RECOMMENDED BEFORE COMMERCIAL LAUNCH

# Proposed data-retention schedule

This is a proposed operational schedule. The CEO and legal adviser must set the final retention periods, deletion workflow and legal-hold procedure before commercial launch.

| Data class | Proposed retention | Reason | Decision required |
| --- | --- | --- | --- |
| User/account records | account term + 90 days | access/support/offboarding | confirm |
| Customers, conversations, quotes and documents | customer relationship/pilot term + 12 months | service/support/dispute context | confirm |
| Invoices and immutable snapshots | 7 years | proposed Dutch fiscal-record period | legal confirmation required |
| Audit/security logs | 12 months | incident investigation/security | confirm proportionality |
| AI-run metadata | 90 days unless needed for security/dispute | operations/cost diagnostics | confirm |
| E-mail delivery metadata | 12 months if e-mail is enabled | delivery/support evidence | confirm |
| Backups | two rotating encrypted sets, maximum 30 days unless legal hold | disaster recovery | confirm storage/retention |

## Deletion principles

Delete or anonymise data once the approved retention period ends, unless a legal hold or statutory retention duty applies. Do not delete invoice snapshots, audit records or related data through an ad-hoc cleanup. Deletions must be authorised, logged and tested in a non-production environment first.

## Pilot boundary

The current RC1/OR2E data is development/test data. It must remain outside the future production project. Any cleanup of the existing project requires a separately reviewed plan because invoice numbering, audit records, foreign keys and Storage objects can be affected.

