# FlowOS backup- en herstelrunbook

## Doel en harde grenzen

Dit runbook maakt een toekomstige, gecontroleerde backup en hersteltest herhaalbaar. Het voert zelf geen backup, export of herstel uit. Een backup is pas geldig na een succesvolle hersteltest met de integriteitscontroles uit [backup-integrity-tooling.md](./backup-integrity-tooling.md).

**Harde regel:** herstel nooit direct over productie of staging. Herstel altijd eerst naar een nieuwe, geïsoleerde wegwerpomgeving.

De voorlopige pilotstrategie is:

- **[PAID PLAN REQUIRED]** Supabase Pro voor beheerde dagelijkse databaseback-ups.
- Een afzonderlijke, versleutelde backup van `company-documents` en `company-images`.
- PITR is uitgesteld voor de eerste pilot met 2–5 bedrijven.
- AI blijft `mock`; OpenAI, Resend, Stripe en externe agenda-providers blijven uitgeschakeld.

## Verantwoordelijkheden

| Rol | Verantwoordelijkheid |
| --- | --- |
| **PRIMARY BACKUP OWNER — CEO DECISION REQUIRED** | Voert of controleert backups, verifieert manifest/checksums en registreert bewijs. |
| **BACKUP OWNER / REPLACEMENT — CEO DECISION REQUIRED** | Onafhankelijke vervanger; ontvangt storingsmeldingen en kan onder goedkeuring herstellen. |
| **CEO** | Keurt backupopslag, retentie, drill, herstelomgeving, eventuele cutover en vernietiging goed. |

Alleen deze rollen mogen backup-artifacts ontsleutelen. Geen medewerker, klant of applicatieaccount krijgt die toegang.

## Backupscope

| Onderdeel | Vereiste backup | Opmerking |
| --- | --- | --- |
| Database | Volledige gecontroleerde database-export plus schema-/integriteitssnapshot | Bevat tenantdata, Auth-data, auditdata, ledger en financiële snapshots. |
| Storage | Afzonderlijke byte-export plus manifest van beide private buckets | Databaseback-ups bevatten geen Storage-bytes. |
| Applicatie | Herleidbare Git-release/commit | Geen `.env`- of secretbestanden in de repository. |
| Configuratie | Handmatige, secretvrije inventaris van Supabase Auth, Vercel en providerstatus | Secrets blijven uitsluitend in de relevante secret manager. |
| Secrets | Niet opnemen in artifact of manifest | Alleen herstel-/rotatie-instructies documenteren. |

Het machineleesbare contract staat in [backup-manifest.schema.json](./backup-manifest.schema.json). Bewaar echte manifests uitsluitend versleuteld buiten deze repository.

## Toekomstige databasebackup

1. **[CEO APPROVAL]** Bevestig de bron als productie, leg UTC-tijd, operator, release/commit en migratieledger vast.
2. **[CREDENTIAL REQUIRED]** Gebruik uitsluitend een goedgekeurde, tijdelijke operatorverbinding met minimale rechten.
3. Maak een volledige database-export volgens de op dat moment geldige Supabase-Procedure en daarnaast een schema-/integriteitssnapshot met `scripts/operations/backup-integrity-snapshot.sql`.
4. Bereken SHA-256 voor elk artifact; noteer uitsluitend identifiers en checksums in het versleutelde manifest.
5. Versleutel artifacts vóór opslag. Gebruik een organisatiebeheerde sleutel; bewaar die sleutel niet naast de backup.
6. Controleer dat de manifestversie, checksums en objectaantallen volledig zijn. Een mislukte controle betekent **geen geldige backup**.

Gebruik geen backupnaam met klantnaam, e-mailadres, token of geheim. Gebruik bijvoorbeeld een UTC-tijdstempel plus willekeurige artifact-ID.

## Toekomstige Storage-backup

1. **[CEO APPROVAL]** Leg bucketconfiguratie en de verwachte private status vast.
2. **[CREDENTIAL REQUIRED]** Inventariseer alleen `company-documents` en `company-images`.
3. Exporteer ieder object onder behoud van bucket en volledig tenant-geprefixte pad.
4. Bereken een SHA-256 over de daadwerkelijke bytes van elk object; neem pad, bytegrootte en checksum op in het versleutelde manifest.
5. Neem Storage-objectmetadata alleen als bijlage op wanneer nodig voor herstel; geen documentinhoud in het manifest zelf.
6. Verifieer na export objectaantal en checksumset tegen de inventaris.

Een eerste echte drill moet via de normale FlowOS-uploadflow één onschadelijk synthetisch bestand bevatten. Dit bewijst zowel herstel van bytes als de normale tenanttoegang.

## Encryptie, opslag en retentie

- Encryptie in transit én in rust is verplicht.
- Gebruik een tweede, organisatiebeheerde en toegangsbeperkte opslaglocatie; een enkele laptop is onvoldoende.
- Bewaar minimaal twee succesvolle, roterende sets totdat **[LEGAL POLICY REQUIRED]** retentie definitief is goedgekeurd.
- Pas geen automatische verwijdering toe zonder CEO-goedkeuring en gecontroleerde retentieprocedure.
- Bewijsbestanden bevatten geen wachtwoorden, JWT's, raw public tokens, service-role keys, Authorization-headers of klantdocumentinhoud.

## Privacyafbakening

- Backup-artifacts en manifests zijn gevoelige informatie: versleutel ze,
  beperk toegang tot aangewezen backupowners en log alleen minimaal bewijs.
- De herstelomgeving is eveneens gevoelig. Gebruik een geïsoleerd project,
  synthetische controleaccounts waar mogelijk en laat OpenAI, Resend, Stripe en
  kalenderproviders uitgeschakeld.
- Een data-subject-verzoek kan gegevens in historische back-ups raken. Back-ups
  worden niet per record herschreven; de kopie verdwijnt volgens de nog goed te
  keuren retentie/rotatie.
- Vernietiging van een artifact of herstelomgeving vereist een expliciete
  goedkeuring en verificatie van het exacte doelobject.

## Voorbereiding van een hersteltest

1. **[CEO APPROVAL]** Wijs een herstelvenster, operator, onafhankelijke controleur en doelomgeving toe.
2. Maak een nieuwe, lege, geïsoleerde recoveryomgeving; de projectreferentie moet aantoonbaar verschillen van productie én staging.
3. Zet voor die omgeving `AI_MODE=mock`.
4. Bewijs vóór het starten dat deze variabelen ontbreken of uitgeschakeld zijn: `OPENAI_API_KEY`, `RESEND_API_KEY`, Stripe-secrets/webhooks, Google Calendar-credentials en Microsoft Calendar-credentials.
5. Gebruik geen productie-URL, productiedomein, productiewebhook of productieredirect in de recoveryomgeving.
6. Leg `backup timestamp`, `drill start` en de gekozen artifact-ID vast in [restore-drill-evidence-template.md](./templates/restore-drill-evidence-template.md).

Stop direct wanneer de doelomgeving productie/staging blijkt te zijn, een providercredential aanwezig is, een checksum afwijkt, een bronartifact ontbreekt of een niet-goedgekeurde credential nodig blijkt.

## Databaseherstel

1. Controleer artifactchecksum vóór ontsleuteling en opnieuw vóór import.
2. Herstel de database in de lege recoveryomgeving volgens de methode die bij het artifact is vastgelegd.
3. Meng nooit ondoordacht een volledige schema+data-import met een tweede migratiereplay. Gebruik precies één vastgelegde herstelmethode en controleer daarna de migratieledger.
4. Leg `database restored` vast; voer daarna de read-only integriteitssnapshot uit.
5. Vergelijk de bron- en herstelsnapshot lokaal met `scripts/operations/compare-integrity-snapshots.mjs`.

## Auth-validatie

Na herstel moeten minimaal deze controles slagen met een expliciet aangewezen synthetische testgebruiker:

1. Auth-gebruiker en identity-relatie bestaan.
2. Het interne gebruikersprofiel bestaat.
3. Company-membership en rol zijn gelijk aan de bron.
4. Opnieuw aanmelden werkt in de recoveryomgeving.

Veronderstel nooit dat bestaande sessies of JWT's overdraagbaar zijn: een herstelde omgeving vereist een nieuwe aanmelding. Leg geen wachtwoord, sessie of token vast in bewijsmateriaal.

## Storageherstel en tenantcontrole

1. Herstel buckets als private buckets met de goedgekeurde limieten en MIME-regels.
2. Herstel objecten met exact hetzelfde bucket- en tenant-geprefixte pad.
3. Vergelijk per bucket objectaantal en SHA-256 met het manifest.
4. Test via de normale applicatieflow dat tenant A zijn synthetische object kan lezen en tenant B dit object niet kan lezen.
5. Test dat Storage- en databaseverwijzingen naar dezelfde tenant wijzen.

## Integriteitsvalidatie

Gebruik uitsluitend de read-only query en lokale vergelijker uit [backup-integrity-tooling.md](./backup-integrity-tooling.md). Vereist zijn onder meer:

- migratieledger, tabellen, RLS, policies, functies, triggers en ACL's;
- aantallen van de kern-tabellen;
- financiële fingerprints en totalen van offertes/facturen en regels;
- relaties tussen company, customer, quote, invoice, planning en entitlement;
- twee-tenant RLS-/write-/Storage-proef;
- `/api/health` van de geïsoleerde omgeving.

Een afwijking is een herstelstop totdat de CEO de oorzaak en vervolgstap heeft goedgekeurd.

## RPO/RTO en bewijs

Gebruik het evidence-template. Meet uitsluitend tijdens een echte drill:

- **RPO:** tijd tussen de laatste volledig geverifieerde backup en de gekozen incident-/drillstart.
- **Databaseherstelduur:** database restore start → database restored.
- **Storageherstelduur:** Storage restore start → Storage restored.
- **Validatieduur:** validatie start → alle controles groen.
- **RTO:** drill/incident start → applicatie bruikbaar na volledige validatie.

Er zijn nog geen doelen of resultaten bewezen; vul geen geschatte tijden in.

## Eerste veilige failure-injection-scenario

De eerste pilot-readiness drill simuleert **verlies van een klein synthetisch bedrijf met één klant, geaccepteerde offerte, factuur en één synthetisch Storage-object** in de geïsoleerde recoveryomgeving. Dit is klein genoeg om veilig te blijven, maar bewijst database-, financiële-, Auth-, Storage- en tenantherstel samen.

De scenario's `bad migration`, brede databaseverlies-simulatie en corrupte financiële records volgen pas na een geslaagde basisdrill en aparte CEO-goedkeuring.

## Cutover, opruimen en noodstop

- Een recoveryomgeving mag nooit naar productie worden gepromoveerd zonder afzonderlijke CEO-goedkeuring, securitycontrole en communicatiestrategie.
- Vernietig de tijdelijke omgeving en lokale tijdelijke bestanden alleen na CEO-goedkeuring; bewaar uitsluitend het minimale, versleutelde bewijs volgens retentiebeleid.
- Bij vermoeden van credentialcompromis: stop herstel, roteer de betrokken credentials volgens het incidentrunbook en laat alle gebruikers opnieuw aanmelden waar nodig.
- Bij financiële afwijking: wijzig of verwijder geen factuurdata. Isoleer, bewaar auditbewijs en escaleer naar CEO/legal.

## Open goedkeuringen

- **CEO APPROVAL:** backup-owner, vervanger, backupmoment, herstelvenster, recoveryomgeving, vernietiging en eventuele cutover.
- **PAID PLAN REQUIRED:** Supabase Pro voordat managed daily backups als pilotcontrole worden geclaimd.
- **CREDENTIAL REQUIRED:** beperkte backup-/restoreoperatorverbindingen, nooit clientsecrets.
- **LEGAL POLICY REQUIRED:** retentie, opslaglocatie, toegang en omgang met financiële bewaarplicht.
