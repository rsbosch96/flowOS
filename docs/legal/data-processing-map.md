# CONCEPT — DATA PROCESSING MAP

Eigenaar: `[LEGAL_COMPANY_NAME]` · datum: `[EFFECTIVE_DATE]`
Gebruik: technische inventaris voor juridische review; geen vaststelling van
grondslag, rollen of bewaartermijnen.

| Gegevenscategorie | Doel | Systeem/objecten | Tenantgrens | Provider/status | Retentie en einde | Juridische review |
| --- | --- | --- | --- | --- | --- | --- |
| Gebruiker, login en rol | Auth, toegang en support | `auth.users`, `users`, `company_memberships` | Gebruiker is lid van één of meer companies | Supabase **actief** | Zie retentieconcept; revoke vóór verwijderen | Rol controller/verwerker, accountbeleid |
| Bedrijfsprofiel/catalogus | Organisatie- en offerteconfiguratie | `companies`, producten | `company_id` | Supabase/Vercel **actief** | Zie retentieconcept | Zakelijke/persoonsdata scheiden |
| Klantcontact en adres | Aanvraag, offerte, factuur, planning | `customers`, snapshots | `company_id`; relaties zijn tenantgebonden | Supabase/Vercel **actief** | Per controllerinstructie/financiële uitzondering | Grondslag en DSR-afhandeling |
| Gesprekken en aanvragen | Klantvraag en opvolging | `conversations`, `conversation_messages` | Samengestelde tenantintegriteit | Supabase/Vercel **actief** | Zie retentieconcept | Inhoud/minimalisatie |
| Offertes en klantbeslissingen | Concept, publicatie en acceptatie/weigering | `quotes`, `quote_items`, hashed tokenvelden | `company_id` | Supabase/Vercel **actief** | Link eerst intrekken; zie retentieconcept | Contract-/geschillenbeleid |
| Facturen en snapshots | Financiële administratie en PDF | `invoices`, `invoice_items` | `company_id` | Supabase/Vercel **actief** | Apart financieel besluit; immutable data | Fiscale termijn/correcties |
| Documenten en afbeeldingen | Bijlagen en productafbeeldingen | `documents`; private `company-documents`/`company-images` | Servergegenereerd tenantprefix | Supabase Storage **actief** | Database + Storage samen behandelen | Bestandsinhoud, wissen/export |
| Planning | Operationele afspraken | `planning_events` | `company_id`, gekoppelde core-records | Supabase/Vercel **actief** | Annuleren is niet wissen | Operationeel doel |
| Audit/security/rate limit | Integriteit, misbruik- en incidentonderzoek | `audit_logs`, `rate_limit_windows`, veilige runtime logs | Tenant/actor waar aanwezig | Supabase/Vercel **actief** | Minimaliseren volgens goedgekeurd beleid | Proportionaliteit/logretentie |
| AI-runmetadata | Kosten/operationele diagnose | `ai_runs` | `company_id` | **mock; OpenAI uit** | Geen prompt of klantdocument in runmetadata | Herbeoordelen vóór live AI |
| E-maildeliverymetadata | Toekomstig bezorgbewijs | `quote_email_deliveries` | `company_id` | Resend **uit** | Niet actief; besluit vóór activatie | DPA/retentie/inhoud |
| Healthmonitoring | Beschikbaarheid en alerts | generieke `/api/health`-response | Geen tenantinhoud ontworpen | UptimeRobot **actief** | Monitor-/alertretentie te bepalen | DPA/doorgiften |

Back-ups bevatten mogelijk kopieën van meerdere categorieën en zijn daarom
apart gereguleerd in [data-retention.md](./data-retention.md) en
[backup-restore.md](../operations/backup-restore.md).
