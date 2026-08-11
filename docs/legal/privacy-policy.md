# CONCEPT — NIET PUBLICEREN ZONDER JURIDISCHE REVIEW

# Privacyverklaring FlowOS

Effectieve datum: `[EFFECTIVE_DATE]`
Verwerkingsverantwoordelijke: `[LEGAL_COMPANY_NAME]`, handelend als `[TRADE_NAME]`
Adres: `[BUSINESS_ADDRESS]`
KvK: `[KVK_NUMBER]` · btw: `[VAT_NUMBER]`
Privacycontact: `[PRIVACY_EMAIL]` · support: `[SUPPORT_EMAIL]`

Dit is een invulconcept. De rolverdeling, grondslagen, contactgegevens,
bewaartermijnen, internationale doorgiften en tekst moeten vóór publicatie door
een bevoegde juridische adviseur worden bevestigd.

## Welke gegevens en waarom

FlowOS verwerkt, afhankelijk van gebruik, account- en toegangsgegevens,
bedrijfsgegevens, klantcontact- en adresgegevens, aanvragen/gesprekken,
offertes, facturen en snapshots, catalogusgegevens, planninggegevens, geüploade
bestanden, audit/securitygegevens en beperkte technische metadata. De beoogde
doelen zijn de offerte-tot-factuurdienst, tenantbeveiliging, ondersteuning,
incidentbehandeling en toepasselijke verplichtingen. Zie het gedetailleerde
[data processing map](./data-processing-map.md).

Voor klantgegevens van een installatiebedrijf is dat bedrijf doorgaans de
verwerkingsverantwoordelijke en `[LEGAL_COMPANY_NAME]` doorgaans verwerker. Voor
eigen account-, beveiligings- en supportadministratie kan
`[LEGAL_COMPANY_NAME]` een eigen rol hebben. Dit moet per contract juridisch
worden vastgesteld.

## Actieve en uitgeschakelde diensten

Supabase (Auth, database en private Storage), Vercel (hosting/runtime) en
UptimeRobot (generieke healthmonitoring) zijn technisch actief. De productie-
Supabase-regio is `eu-west-2`. OpenAI is uitgeschakeld (`AI_MODE=mock`); Resend,
Stripe, Google Calendar en Microsoft Calendar zijn eveneens uitgeschakeld. Het
subprocessorregister bevat de te beoordelen contractuele details.

## Beveiliging, retentie en rechten

FlowOS gebruikt tenantisolatie, rollen, private Storage, hashed publieke
linktokens, auditlogging en rate limiting. Dit is geen garantie van absolute
veiligheid. Bewaar- en verwijderbesluiten staan nog als concept in
[data-retention.md](./data-retention.md).

Een betrokkene kan inzage, rectificatie, wissing, beperking, bezwaar of export
verzoeken via `[PRIVACY_EMAIL]`. FlowOS verifieert de bevoegdheid en stemt
verwerkersverzoeken af met de relevante klant/controller. De interne procedure
staat in [data-subject-requests.md](../operations/data-subject-requests.md).

## Wijzigingen en incidenten

Materiële wijzigingen worden bekendgemaakt via `[COMMUNICATION_CHANNEL — LEGAL
REVIEW REQUIRED]`. Vermoedelijke incidenten met persoonsgegevens volgen de
[incidentprocedure](../operations/incident-response.md); eventuele meldingen
worden pas na juridische beoordeling bepaald.
