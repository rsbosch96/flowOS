# CONCEPT — LEGAL REVIEW REQUIRED BEFORE REAL PERSONAL DATA

# Subprocessorregister

Dit register beschrijft alleen de technisch bewezen status van FlowOS op
`[EFFECTIVE_DATE]`. Het is geen ondertekend verwerkersregister. `[LEGAL_COMPANY_NAME]`
en de juridisch adviseur bevestigen vóór een externe pilot met echte gegevens per
actieve partij het contract, de verwerkersrol, locatie, doorgiften en eventuele
passende waarborgen.

| Provider | Doel en gegevenscategorieën | Technische status | Bewezen locatie/status | Nog te bevestigen |
| --- | --- | --- | --- | --- |
| Supabase | Auth, PostgreSQL en private Storage: accounts, bedrijfs-, klant-, offerte-, factuur-, document- en auditgegevens | **ACTIEF** | Productieproject in `eu-west-2` | DPA, subverwerkers, opslaglocatie en doorgiften |
| Vercel | Next.js-hosting en veilige runtime-/requestlogs | **ACTIEF** | FlowOS Production draait op Vercel | DPA, regio's, logretentie en doorgiften |
| UptimeRobot | Beschikbaarheid van de generieke `/api/health`-endpoint en incidentmeldingen | **ACTIEF** | Externe monitor en down/recovery-proof zijn actief bewezen | DPA, alertcontact, logretentie en doorgiften |
| OpenAI | Toekomstige AI-offertegeneratie | **UITGESCHAKELD** (`AI_MODE=mock`) | Geen echte provider-call toegestaan | Juridische grondslag, DPA, doorgiften, inputminimisering |
| Resend | Toekomstige transactionele e-mail | **UITGESCHAKELD** | Geen e-mailverzending toegestaan | DPA, afzender, retentie, doorgiften |
| Stripe | Toekomstige abonnementen/betalingen | **UITGESCHAKELD** | Geen betaalflow toegestaan | Rollen, DPA/voorwaarden, betaal- en fiscale bewaarplichten |
| Google Calendar | Toekomstige agenda-integratie | **UITGESCHAKELD** | Geen providercode of credentials in Planning v1 | DPA, OAuth-scope, doorgiften |
| Microsoft Calendar | Toekomstige agenda-integratie | **UITGESCHAKELD** | Geen providercode of credentials in Planning v1 | DPA, OAuth-scope, doorgiften |

## Minimale wijzigingsprocedure

1. Voeg een provider niet toe aan productie voordat `[LEGAL_COMPANY_NAME]` en
   juridisch advies het doel, de gegevens en het contract hebben beoordeeld.
2. Werk dit register, de verwerkersovereenkomst en de privacyverklaring bij.
3. Leg een CEO-goedkeuring, datum, configuratiewijziging en eventuele
   doorgiftebeslissing vast zonder secrets op te nemen.
4. Test de provider eerst met synthetische data en zonder onnodige productiegegevens.

FlowOS bewaart geen raw publieke offertoken in database-, audit- of
deliverymetadata; de applicatie gebruikt een hash voor lookup.
