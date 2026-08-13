# FlowOS read-only herstel-integriteitstooling

Deze tooling vergelijkt een bronmoment met een herstelde omgeving. Zij maakt geen databaseverbinding, export, Storage-upload, restore of wijziging zelf.

## Artefacten

| Bestand | Functie |
| --- | --- |
| `scripts/operations/backup-integrity-snapshot.sql` | Eén expliciete read-only SQL-snapshot met metadata, tellers en fingerprints. |
| `scripts/operations/storage-backup-inventory.sql` | Read-only Storage-inventaris en private-bucketcontrole. |
| `scripts/operations/compare-integrity-snapshots.mjs` | Lokale vergelijker van twee versleuteld bewaarde snapshot-JSON-bestanden. |
| `docs/operations/backup-manifest.schema.json` | Contract voor het versleutelde backupmanifest. |
| `scripts/operations/hash-backup-artifacts.mjs` | Netwerkvrije, deterministische SHA-256-inventaris en verificatie van lokale artifacts. |
| `scripts/operations/create-backup-manifest.mjs` | Netwerkvrije generator die metadata valideert voordat een manifest wordt geschreven. |
| `scripts/operations/storage-backup-local.mjs` | Lokale/mock Storage-export en -restore voor de toekomstige procedure; geen Supabase-client. |
| `scripts/operations/recovery-safety.mjs` | Fail-closed guard voor recoverydoelen en provider-kill-switches. |

## Toekomstige veilige uitvoering

1. **[CEO APPROVAL]** Leg bron- en herstelprojectreferentie vast. Zij mogen nooit gelijk zijn; herstelproject mag ook niet staging zijn.
2. **[CREDENTIAL REQUIRED]** Gebruik een goedgekeurde read-only databaseverbinding voor de bron en een hersteloperatorverbinding alleen voor de herstelstappen. De snapshotquery zelf wijzigt niets.
3. Voer `backup-integrity-snapshot.sql` eenmaal uit tegen de bron en eenmaal tegen de herstelde omgeving. Doe hetzelfde met `storage-backup-inventory.sql`. Sla iedere JSON-uitvoer versleuteld op.
4. Vergelijk beide paren lokaal, afzonderlijk: `node scripts/operations/compare-integrity-snapshots.mjs <source-integrity.json> <restored-integrity.json>` en daarna hetzelfde voor de twee Storage-inventarissen.
5. Een exitcode `0` is alleen een metadata-/integriteitsovereenkomst. Voltooi daarnaast de Auth-, twee-tenant- en Storage-runtimeproeven uit het runbook.

De snapshots bevatten geen documentinhoud, e-mailadressen, wachtwoorden, tokens of secrets. Ze bevatten wel gevoelige operationele metadata en hashes; behandel ze daarom als versleutelde backup-artifacts.

## Wat de database-snapshot bewijst

- migration ledger, verwachte tabellen, RLS, policies, functies, triggers en tabel-ACL;
- kernrecordaantallen;
- financiële en snapshot-fingerprints zonder regelinhoud terug te geven;
- relationele mismatchaantallen voor company/customer/quote/invoice/planning/entitlement;
- Auth-gebruikers- en identity-aantallen/fingerprint.

## Wat de Storage-inventaris aanvullend bewijst

- alleen de twee bedoelde buckets;
- private bucketstatus;
- tenant-geprefixte objectpaden;
- objectaantallen en bytegrootten.

De daadwerkelijke SHA-256 van Storage-bytes wordt tijdens de toekomstige export berekend en hoort in het backupmanifest. Database-Storagemetadata is geen vervanging voor een byte-backup.

## BR1D-uitvoeringsgrenzen

De BR1D-scripts zijn **voorbereide lokale tooling**, geen backupdienst. Zij
openen geen Supabase-, Vercel-, Storage- of providernetwerkverbinding. Een
latere operator moet bronacquisitie en herstel afzonderlijk autoriseren volgens
[br1d-backup-restore-execution.md](./br1d-backup-restore-execution.md).

Voor iedere write in een recoveryomgeving vereist de guard tegelijk een
afwijkend project-ID, `ENVIRONMENT_TYPE=recovery` en de expliciete bevestiging.
Productie en staging worden hard geweigerd. De provider-kill-switch vereist
`AI_MODE=mock` en afwezigheid van OpenAI-, Resend-, Stripe-, n8n-, Google- en
Microsoft-credentials. De scripts printen nooit artifactinhoud of
credentialwaarden.

## Vereiste runtimeproeven na herstel

Met twee synthetische tenants en twee testgebruikers:

1. Tenant A leest/schrijft alleen eigen toegestane data.
2. Tenant B leest/schrijft alleen eigen toegestane data.
3. Cross-tenant SELECT, INSERT met vreemde relaties en UPDATE worden geweigerd.
4. Planning-entitlements worden bij beide tenants gecontroleerd.
5. Een synthetisch object uit de normale uploadflow is voor de juiste tenant leesbaar en voor de andere tenant niet.
6. Een synthetische Auth-gebruiker meldt opnieuw aan en behoudt membership/rol.

Geen token, wachtwoord, Authorization-header of documentinhoud wordt als bewijs opgeslagen.
