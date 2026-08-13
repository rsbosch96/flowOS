# BR1D backup- en hersteluitvoeringskit

## Status en harde grens

| Onderdeel | Status |
| --- | --- |
| BR1-tooling | PREPARED |
| Real production backup | NOT CREATED |
| Real Storage backup | NOT CREATED |
| Real restore | NOT RUN |
| RPO | NOT PROVEN |
| RTO | NOT PROVEN |

Dit document is een toekomstige operatorprocedure, geen autorisatie om nu een
backup, export, restore, recoveryproject, betaalde dienst of provideractie uit
te voeren. Iedere write-capable fase heeft een **STOP / CEO APPROVAL**-poort.

## Artifactlayout

Gebruik per drill één lege, lokaal genegeerde directory. Gebruik een UTC-tijd
plus willekeurige backup-ID; nooit een klantnaam, e-mail, token of secret.

```text
backup-artifacts/<utc>-<backup-id>/
  database/<artifact-id>.dump.age
  storage/<bucket>/<exact-object-path>
  integrity/source-integrity.json.age
  integrity/source-storage.json.age
  checksums/database.inventory.json
  checksums/storage.inventory.json
  manifest.json.age
  evidence/restore-drill-evidence.md
```

Tijdelijke plaintext (`.dump`, Storage-bytes, snapshots en ongecodeerd
`manifest.json`) mag alleen bestaan tijdens de geautoriseerde lokale fase,
binnen een versleutelde werkvolume. Hash eerst, versleutel vóór offsite-overdracht
en vernietig plaintext pas nadat de checksum, encrypted artifact en manifest
zijn geverifieerd. Bewaar een sleutel nooit in Git, naast het artifact of in de
manifestinhoud. `backup-artifacts/` en `recovery-artifacts/` zijn expliciet
genegeerd door Git.

## Threat model

| Dreiging | Preventie / detectie | Backup- en herstelrelevantie | Huidige beperking |
| --- | --- | --- | --- |
| Accidentele tenantverwijdering | RLS, auditlogs, tenantproef | Herstel vereist twee-tenantvergelijking | Niet bewezen zonder echte drill |
| Slechte appdeploy | Git-release en rollbackrunbook | Herstel naar geïsoleerde release | Geen live rollbacktest in BR1D |
| Slechte migratie | Ledgerfingerprint, schema/RLS-snapshot | Stop bij ledger- of schema-afwijking | Geen echte import getest |
| Databasecorruptie | Checksums, financiële fingerprints | Alleen een valide dump mag worden hersteld | Geen echte backup beschikbaar |
| Storageverwijdering | Private buckets, objectinventaris | Byte-voor-byte export/restore en SHA-256 | Geen echte Storage-export |
| Gecompromitteerde credential | Incidentprocedure en rotatie | Stop; roteer vóór recovery | Geen sleutelrotatie in deze kit |
| Operatorfout | Projectguard en tweede controleur | Fail-closed vóór recovery-write | Menselijke controle blijft vereist |
| Gedeeltelijke restore | Manifest en per-bucket inventaris | Stop bij ontbrekend/onbekend artifact | Geen echte restoreproef |
| Wrong-tenant restore | Database-invarianten en runtime RLS-proef | A/B-relaties moeten gelijk blijven | Alleen toekomstige synthetische proef |
| Verouderde backup | UTC-timestamp en RPO-meting | Meet verschil vóór incident | RPO nog niet bewezen |
| Corrupt artifact | SHA-256 vóór/na encryptie en restore | Hash mismatch blokkeert vervolg | Alleen lokale synthetische proof |
| Verloren encryptiesleutel | Gescheiden key-custody | Geen herstel starten zonder key-preflight | Key-custody vraagt CEO/legal besluit |
| Recovery raakt providers | Kill-switchguard | `AI_MODE=mock`; geen providercredentials | Runtimeconfig nog niet echt hersteld |

## Lokale tooling en geen-netwerkcontract

De volgende scripts werken uitsluitend met lokale paden en JSON. Zij gebruiken
geen Supabase SDK, geen HTTP-client en geen credentials:

```text
node scripts/operations/hash-backup-artifacts.mjs <artifact-directory>
node scripts/operations/hash-backup-artifacts.mjs --verify <artifact-directory> <inventory.json>
node scripts/operations/create-backup-manifest.mjs --input <metadata.json> <manifest.json>
node scripts/operations/storage-backup-local.mjs export <synthetic-source> <artifact-directory>
node scripts/operations/storage-backup-local.mjs verify <artifact-directory>
```

De manifestgenerator verwacht uitsluitend secretvrije metadata: backup-ID,
UTC-tijd, bronproject/region, Git-commit, ledgerversies, checksummetadata,
operatorrol, kill-switchbevestiging en validatiestatus. Hij valideert tegen het
versie-1 manifestcontract en schrijft geen onbekende inputvelden door.

De lokale Storage-adapter behandelt uitsluitend `company-documents` en
`company-images`, bewaart exacte paden, grootte en SHA-256, en detecteert
ontbrekende of gewijzigde bytes. Dit is een mock/filesystem-adapter: de echte
Supabase-exportadapter wordt pas na CEO-goedkeuring en de gekozen backupmethode
verbonden.

## Fase 0–14 operatorchecklist

1. **Fase 0 — autorisatie.** **STOP / CEO APPROVAL:** leg drill-ID, bron,
   recoveryproject, operator, onafhankelijke controleur en betaalde actie vast.
2. **Fase 1 — identiteit.** Bevestig bronproject, region, releasecommit en
   ledger. Recoveryproject moet aantoonbaar nieuw en geïsoleerd zijn.
3. **Fase 2 — provider kill-switch.** Valideer `AI_MODE=mock` en afwezigheid
   van OpenAI, Resend, Stripe, Google, Microsoft en n8n-configuratie.
4. **Fase 3 — databaseacquisitie.** **STOP / CEO APPROVAL + CREDENTIAL:** kies
   exact één methode: Supabase managed backup/clone na Pro-activatie, of een
   gecontroleerde `pg_dump`-compatibele export. Voor de tweede methode legt de
   operator vooraf `pg_dump --version` en `pg_restore --version` vast, gebruikt
   een custom dumpformaat en levert credentials via een tijdelijk,
   toegangsbeperkt secretsbestand of interactieve invoer — nooit via de
   commandline of shellhistorie. De herstelmethode moet expliciet vastleggen
   welke applicatieschema's (`public`, `auth`, `storage` en
   `supabase_migrations`) en welke rollen/grants worden meegenomen; deze keuze
   wordt bij het echte artifact geverifieerd, niet hier verondersteld. Leg
   toolversie, dumpformaat, Auth/role- en grantverwachtingen vast en maak meteen
   een read-only integriteitssnapshot.
5. **Fase 4 — Storage-export.** **STOP / CEO APPROVAL + CREDENTIAL:** exporteer
   alleen de twee private buckets met exact pad en bytes. Vergelijk objectaantal,
   grootte en SHA-256; publiceer buckets nooit.
6. **Fase 5 — hashing/manifest.** Bereken SHA-256 deterministisch, bouw en
   valideer het secretvrije manifest. Onbekend artifact of mismatch is stop.
7. **Fase 6 — encryptie.** Gebruik `age` met een organisatiebeheerde publieke
   ontvangerssleutel. Vereiste preflight: `age --version`, keyreference buiten
   Git en een gescheiden private key. Voorbeeld alleen met placeholders:
   `age -r <approved-recipient> -o <artifact>.age <artifact>`. Verifieer het
   encrypted bestand. Een decryptietest mag uitsluitend met synthetische data in
   een geïsoleerde lokale directory. BR1D installeert `age` niet.
8. **Fase 7 — tweede locatie.** **STOP / CEO APPROVAL:** verplaats uitsluitend
   versleutelde artifacts naar de goedgekeurde offsite locatie; verifieer opnieuw
   checksum en bewijs, zonder contents in logs.
9. **Fase 8 — recoveryomgeving.** **STOP / CEO APPROVAL + PAID/PROJECT DECISION:**
   maak een lege recoveryomgeving. Het doel mag nooit productie of staging zijn.
10. **Fase 9 — restore.** **STOP / CEO APPROVAL:** herstel database volgens de
    bij het artifact vastgelegde methode, daarna private Storage-buckets met
    exact pad. Er is geen overwrite zonder expliciete goedgekeurde modus.
11. **Fase 10 — integriteit.** Voer de twee bestaande read-only snapshots uit en
    vergelijk ze lokaal. Controleer ledger, RLS, ACL, functies,
    SECURITY DEFINER-search paths, auditlogs, catalog/template-data,
    conversations/messages, taken, quote delivery evidence en entitlements.
12. **Fase 11 — Auth en tenant.** Gebruik een nieuwe synthetische recovery-login;
    oude sessies/JWT's zijn ongeldig bewijs. Test Tenant A, Tenant B en een
    gedeelde synthetische gebruiker: alleen herstelde memberships, Planning
    entitlement, A↔B-RLS/write-denial en private Storage-isolatie.
13. **Fase 12 — RPO/RTO.** Meet RPO = backup timestamp → drill/incident start;
    meet RTO = drill start → app bruikbaar na alle checks. Geen targets of
    resultaten invullen vóór de echte drill.
14. **Fase 13–14 — bewijs en vernietiging.** Vul het evidence-template in.
    **STOP / CEO APPROVAL:** capture bewijs, verwijder tijdelijke recoveryusers,
    revoke tijdelijke credentials, vernietig lokale plaintext en het recoveryproject.
    Behoud alleen goedgekeurde versleutelde artifacts volgens toekomstige retentie.

## Financiële en relationele herstelvalidatie

De restore mag pas bruikbaar heten wanneer de read-only snapshot en
runtimechecks aantonen: invoice counters/nummers, immutable invoice en
invoice_item snapshots, subtotal/BTW/totaal, quote→invoice-relaties, quote_items,
auditlogs en Planning/entitlement-relaties zijn gelijk aan de bron. Een mismatch
wordt nooit hersteld door facturen te wijzigen of te verwijderen: isoleer,
behoud bewijs en escaleer.

## Hersteldoelguard

Een toekomstige Storage-restore vereist tegelijk:

```text
ENVIRONMENT_TYPE=recovery
target project ID != ivifmemxvgglvnnarubt
target project ID != lkmzwhbbffppyiiiyswk
--confirm I_UNDERSTAND_THIS_IS_A_RECOVERY_ENVIRONMENT
```

Voorbeeld met een placeholder voor een nog niet bestaand recoveryproject:

```text
node scripts/operations/storage-backup-local.mjs restore <artifact-dir> <recovery-dir> \
  --target-project <isolated-recovery-project-id> \
  --confirm I_UNDERSTAND_THIS_IS_A_RECOVERY_ENVIRONMENT
```

De guard weigert een verkeerde omgevingswaarde, beide beschermde project-ID's en
ontbrekende bevestiging vóór een write. Hij logt geen secrets.

## Failure/abort matrix

| Stopconditie | Veilige reactie |
| --- | --- |
| Wrong, productie- of stagingproject | Niet uitvoeren; herbevestig identiteit met CEO |
| Ontbrekende encryptie of keyreference | Geen offsite transfer/restore; herstel key-custody eerst |
| Checksum-, Storage- of onbekend-artifact mismatch | Stop; preserveer artifacts en onderzoek zonder overschrijven |
| Ledger-, financieel-, RLS- of tenantmismatch | Stop; geen cutover, geen financiële mutaties |
| Providercredential of onverwachte externe actie | Stop recoveryruntime; verwijder credential/route en herhaal preflight |
| Ongeldig manifest of onduidelijke recoveryidentiteit | Geen restore; corrigeer bewijs/identiteit |
| Secret exposure | Stop, volg incidentprocedure en roteer betrokken credential |
| Onverwachte betaalde actie | Stop vóór aankoop/upgrade; vraag CEO-goedkeuring |

## Wat nog niet bewezen is

BR1D maakt FlowOS niet backup- of herstelproven. Een toekomstige CEO-goedgekeurde
BR1-uitvoering moet nog aantonen: echte database- en Storage-acquisitie,
encryptie/decryptie met de organisatiekey, tweede opslaglocatie, isolated
Supabase recoveryproject, restore, Auth-herlogin, twee-tenant runtimeproof en
gemeten RPO/RTO.
