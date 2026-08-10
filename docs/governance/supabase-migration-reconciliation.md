# Supabase-migratie-reconciliatie

Status: ontwerp en lokale documentatie. Geen remote history, schema of data is gewijzigd.

## Doel en harde stop

Deze procedure herstelt één reproduceerbare migratiegeschiedenis zonder bestaande
productie- of historische gegevens opnieuw te veranderen. **Voer geen `supabase db
push`, `migration repair`, reset of schema-diff uit voordat een CEO de live
reconciliatie expliciet heeft goedgekeurd.**

De lokale repository is de inhoudelijke bron voor de SQL-bestanden. De live database
is de bron voor de feitelijke objecten. De remote `schema_migrations`-historie moet
na de goedgekeurde reconciliatie exact de canonical lokale versies weerspiegelen.

## Read-only bewijs

- Lokale baseline: `outputs/database-schema.sql` met SHA-256
  `5170d04b9cfd15c550d08b861c96b1a9653937e99af54ee231e7ab0f23b8dc35`.
- Lokale SQL-migraties: 002–010 en 012–028; 011 ontbreekt.
- Remote historie: 002–016 en
  `20260805181835_027_fix_invoice_fiscal_year_ambiguity`.
- Live effecten 017–028 zijn grotendeels aantoonbaar aanwezig: AI-run-kolommen,
  quote-draft RPC, productafbeeldingspad, beide private buckets, profielvelden,
  draft-RPC, hashed-token/delivery-objecten, factuursnapshots/counters/triggers,
  pgcrypto-kwalificatie en de factuur-partijgegevensblokkade.
- De live functie `create_invoice_from_quote(uuid,uuid)` bevat
  `INVOICE_PARTY_DETAILS_MISSING`, hoewel migratie 028 niet remote is geregistreerd.

## Classificaties

- **A — EFFECT LIVE + REMOTE GEREGISTREERD:** geen actie.
- **B — EFFECT LIVE + NIET CORRECT GEREGISTREERD:** alleen historie
  reconciliëren; nooit opnieuw uitvoeren.
- **C — EFFECT GEDEELTELIJK LIVE:** geen originele migratie opnieuw uitvoeren;
  gericht herstellen in een opvolgmigratie.
- **D — EFFECT NIET LIVE:** originele of veilige opvolgmigratie toepassen.
- **E — ONBEKEND / ONVEILIG:** stoppen totdat herkomst en effect zijn bewezen.

## Volledige matrix

| Canonical versie | Lokale bron / SHA-256 | Remote registratie | Verwacht en live bewijs | Klasse | Reconciliatieactie |
|---|---|---|---|---|---|
| 001 | `outputs/database-schema.sql` / `5170d04b9cfd15c550d08b861c96b1a9653937e99af54ee231e7ab0f23b8dc35` | ontbreekt | Kernschema, enums, RLS en basisfuncties bestaan live | B | Bevries dit bestand als baselinebron; maak pas na expliciete review een canonical `001`-migratiebestand en markeer alleen historie, niet schema. |
| 002 | `002_bootstrap_company.sql` / `ac5ad7311a53e2ae92a040316396591daf764625fc1792d2c252610b59f4f95c` | `002` | `bootstrap_company(text,text)` bestaat | A | Geen actie. |
| 003 | `003_ai_runs_write_policy.sql` / `994b36b5c6818c795d14262cee639abe1147b065bc22653f136d8f5423e7e1be` | `003` | AI-run RLS/policies bestaan; latere migraties hebben writes aangescherpt | A | Geen actie. |
| 004 | `004_audit_log_insert_policy.sql` / `87029a92f3b5284d3769ee3cad290e2780b16b64dea1b01fd7b7b250fd299cb9` | `004` | Auditlog bestaat; latere invoice-flow verving browserwrites | A | Geen actie. |
| 005 | `005_secure_ai_run_functions.sql` / `ad10150cc7a1121cf19d3a971aafac0520a12ef11d20e91ccc7bcd3a65378c03` | `005` | Legacy AI-run signatures bestaan als historische overloads | A | Niet opnieuw uitvoeren; legacy-opruiming hoort bij WP13.2. |
| 006 | `006_apply_all_local_fixes.sql` / `871d838d9ff95688411f726f4b9de97d90dac4d7e5fc3154bc5a2ad1b73f79cc` | `006` | AI/audit-correcties zijn historisch aanwezig | A | Geen actie. |
| 007 | `007_quote_controls_and_catalog.sql` / `bde67848b58be7f8fbf67772d91e4ed7a1a87ec71536a4a56f63890c50bc50d7` | `007` | Catalogus, templates, approval rules en defaults-trigger bestaan | A | Geen actie. |
| 008 | `008_customer_quote_portal.sql` / `a61de88e962218c65e344f8a6c54e2c3807a7e4f0dff4e319cada8113b7e1321` | `008` | Oude tokenvelden bestaan bewust als deprecated overgangsvelden | A | Geen actie; hash-flow volgt later. |
| 009 | `009_public_quote_read_and_questions.sql` / `d714b9904ea2fb4ada5117be06fe6611577af381fc889d8314db46ea7a450483` | `009` | Legacy UUID-overloads bestaan maar hebben geen execute-grant | A | Geen actie; overloadbeleid hoort bij WP13.2. |
| 010 | `010_invoices.sql` / `5d8af180845ce2da2527c14ca2cb9a134325cf11167afb8e5cbf6913f0f175d1` | `010` | Invoices/invoice_items bestaan; latere 024 vervangt factuur-RPC | A | Geen actie. |
| 011 | ontbreekt | ontbreekt | Geen betrouwbare bron of aantoonbaar effect | E | Niet reconstrueren op basis van aannames. Eerst originele inhoud/herkomst terugvinden of formeel vastleggen dat versie 011 nooit is uitgegeven. |
| 012 | `012_team_management.sql` / `de7c7c916a38faa787fafb0274ea01c850d95f0457cb280a990fe819b8022468` | `012` | Team-RPC en profielpolicy bestaan | A | Geen actie. |
| 013 | `013_ai_run_gateway_metadata.sql` / `804b1fca0469db42fe776d961b0ad896cedcbfc359e70c2b20aeae18effb8d60` | `013` | Gatewaymetadata-kolommen bestaan; legacy finish-overload bleef bestaan | A | Geen originele migratie opnieuw uitvoeren; overloadopruiming is WP13.2. |
| 014 | `014_sprint_1_25_architecture_hardening.sql` / `b375691f79981c431dced9c6b92c5757698a6fefe9c8e284526c3bc7f7b62b8f` | `014` | Nieuwe server-owned AI-flow bestaat, maar oude `start_ai_run(uuid,text,text)` en oude `finish_ai_run` blijven live | C | Geen rerun. WP13.2 moet exacte legacy-grants intrekken/opruimen. |
| 015 | `015_public_quote_security_hardening.sql` / `39b010aeb4db265bab19ff5ad833ca26b3d3980d4ecfa8a52b00781feb538cb9` | `015` | UUID public-quote overload bestaat maar heeft geen execute-grant | A | Geen actie. |
| 016 | `016_ai_governance_foundation.sql` / `0b751179529342a5bda2de7c2d421646ed4926760a2e2038219091545e95b8c5` | `016` | Governancekolommen en nieuwe server-RPC's bestaan; oude overloads blijven live | C | Geen rerun. WP13.2 behandelt exact signature/privilege-herstel. |
| 017 | `017_repair_ai_runs_gateway_columns.sql` / `6744f2b893c1b763c5a094d7add0dd65c21233d64c05ac17fc6fa25e03a6f754` | ontbreekt | `duration_ms`, `total_tokens`, `error_message`, `metadata` bestaan live | B | Alleen remote historie markeren na toestemming. |
| 018 | `018_restore_create_ai_quote_draft.sql` / `11b60c5b22480d55a5d13ececcee90eef6beb8750221c9a791851fb6c117e9f6` | ontbreekt | `create_ai_quote_draft(...)` bestaat live | B | Alleen remote historie markeren na toestemming. |
| 019 | `019_catalog_product_image_storage.sql` / `1574050e1cb2848f70488489fba7fad77a10b7526811173f098371d8ff511f4d` | ontbreekt | `product_catalog_items.image_storage_path` bestaat live | B | Alleen remote historie markeren na toestemming. |
| 020 | `020_provision_storage_buckets.sql` / `2e5240988fda3d9756798616839a267c466cc256dc83f6ec3351eae0ac7bb457` | ontbreekt | Private `company-documents` en `company-images` bestaan live met limieten/MIME | B | Alleen remote historie markeren na toestemming. |
| 021 | `021_company_profile_contact_fields.sql` / `e28c76b113b5ea73cf0f7fc25a5ab219b581491c50e2c78050962926e6cb38fc` | ontbreekt | `phone`, `email`, `website` bestaan live | B | Alleen remote historie markeren na toestemming. |
| 022 | `022_atomic_draft_quote_updates.sql` / `34f5d4371c1b3771d306ded7753c383d7cc703249cb48deb0ed3fb5ef04ab92e` | ontbreekt | `update_draft_quote(...)` bestaat live | B | Alleen remote historie markeren na toestemming. |
| 023 | `023_quote_delivery_and_hashed_public_tokens.sql` / `01c1ce87b6802ed33ea6eb23aedd7821e1bd6609f99a70f335f7218d193c1417` | ontbreekt | Hashvelden, deliverytabel en text-token RPC's bestaan live | B | Alleen historie markeren; privilegehardening volgt WP13.2. |
| 024 | `024_invoice_integrity_and_numbering.sql` / `3ad6ab69a62a28fa6692464c1db5f5b73c97f8b8c02f9832f52c664916e10c59` | ontbreekt | Snapshotkolommen, teller en immutable triggers bestaan live | B | Alleen remote historie markeren na toestemming. |
| 025 | `025_fix_pgcrypto_schema_qualification.sql` / `557fb7a4e04067ca759854562c1b9f756df76b1034cbd46294b13a13ae879e4a` | ontbreekt | `pgcrypto` staat in schema `extensions`; hash/publicatieflow werkt met kwalificatie | B | Alleen remote historie markeren na toestemming. |
| 026 | `026_repair_quote_delivery_schema_objects.sql` / `688e759893258b843e4a9b3af390a3a6595e7986a9ce11894f4591ff93850926` | ontbreekt | Deliveryobjecten, constraints en text-tokenflow bestaan live | B | Alleen historie markeren; grants worden in WP13.2 gecorrigeerd. |
| 027 | `027_fix_invoice_fiscal_year_ambiguity.sql` / `347013b4ff676ebe4c84842881f0033311804f346bfc3dd2438588b995b05015` | `20260805181835` met zelfde naam | Correcte `target_fiscal_year`-functie bestaat live | B | Kies eerst canonical versienaam. Niet dubbel registreren als `027` zonder expliciet besluit. |
| 028 | `028_require_invoice_party_details.sql` / `413b2dcccbe8640bfd75f3c0f88d9ee6a55a1f267c023f519f7755cce1c4169d` | ontbreekt | Partijgegevensgate bestaat live | B | Alleen remote historie markeren na toestemming. |

## Canonical plan voor live reconciliatie

1. **Freeze:** maak vóór elke write een nieuwe read-only export van lokale hashes,
   remote historie en de in deze matrix genoemde live objecten.
2. **Beslis versie 001:** kopieer de bewezen baseline pas na review naar een
   canonical lokale migratiebron. Registreer de historie daarna, zonder het schema
   opnieuw uit te voeren.
3. **Los versie 011 op:** vind het originele bestand of leg door CEO-besluit vast
   dat 011 niet bestaat. Zonder dit besluit is de historie niet volledig canonical.
4. **Normaliseer versie 027:** kies één identifier. De veiligste optie is de lokale
   bestandsidentiteit af te stemmen op remote `20260805181835`, omdat die remote al
   de enige uitgevoerde registratie is. Wijzig nooit de functie-inhoud tijdens deze
   stap.
5. **Markeer uitsluitend bewezen B-migraties als applied:** 001 (na baselinebesluit),
   017–026 en 028. Gebruik de Supabase-migratiehistorieprocedure die op dat moment
   door de geïnstalleerde CLI/documentatie wordt ondersteund. Voer geen SQL uit die
   de originele DDL herhaalt.
6. **Los C-migraties functioneel op in vervolgwerkpakketten:** 014/016 legacy
   overloads horen in WP13.2; ze mogen niet door history-repair worden verborgen.
7. **Verifieer opnieuw read-only:** lokale lijst, remote historie, signatures,
   buckets, policies en triggers moeten na de reconcile exact met deze matrix
   overeenkomen.

## Toekomstige procedure

- Iedere databasewijziging begint met één nieuw lokaal migratiebestand via de
  Supabase CLI; nooit via handmatige SQL Editor.
- Pull request/review: SQL, exacte signature, grants/RLS en rollbackrisico vooraf
  beoordelen.
- Alleen na expliciete CEO-toestemming: live toepassing op staging, verificatie,
  daarna productie.
- Na iedere toepassing: remote migratielijst en relevante schema-objecten
  read-only vergelijken met lokaal; bewaar de output bij de release.
- Staging en productie gebruiken dezelfde immutable migratiehistorie. Een afwijking
  is een releaseblocker.
- Codex voert diagnose standaard read-only uit en past live migraties uitsluitend
  toe wanneer dit expliciet is opgedragen.

## Niet doen

- Geen `supabase db push` zolang 001/011/027 en B-markeringen niet zijn opgelost.
- Geen reset, schema-rebuild of bulk-heruitvoering.
- Geen originele 017–028 opnieuw uitvoeren op het gekoppelde project.
- Geen wijzigingen aan historische facturen, counters, tokens of klantdata.

## WP13.1-testbewijs

- Alle lokale migratiebestanden zijn SHA-256-gehasht.
- Lokale volgorde bevat 002–010 en 012–028; de baseline en 011-afwijking zijn
  expliciet gedocumenteerd.
- Live tabellen, kolommen, buckets, triggers en functies zijn read-only vergeleken.
- Geen repair-migratie gemaakt: bekende B-effecten bestaan al; C-effecten horen
  bij het volgende strikt gescheiden privilegewerkpakket.
- Voor een verse omgeving is de beoogde volgorde logisch: canonical baseline 001,
  002–010, besluit over 011, 012–028. Een verse opbouw blijft geblokkeerd totdat
  001 en 011 formeel zijn opgelost.
