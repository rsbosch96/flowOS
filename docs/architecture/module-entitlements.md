# Module entitlements

## Doel

ENT1 bepaalt welke optionele productmodules een organisatie mag gebruiken.
Rollen en entitlements zijn bewust gescheiden:

1. authenticatie;
2. membership van de organisatie;
3. entitlement voor de module;
4. rol binnen de module;
5. operatie.

## Core en optionele modules

Core is impliciet beschikbaar voor iedere geldige company member. Core-toegang
vraagt nooit om een rij in `company_module_entitlements` en valt niet terug op
`module_catalog`.

Optionele modules zijn deny-by-default. ENT1 registreert alleen `planning` in
`module_catalog`. Een organisatie krijgt toegang wanneer haar actieve
`company_module_entitlements`-rij voor `planning` bestaat.

Alle organisaties die bestonden toen ENT1 werd toegepast ontvangen veilig één
Planning-entitlement. Nieuwe organisaties ontvangen Core impliciet, maar geen
Planning-entitlement totdat een toekomstige, expliciet goedgekeurde
provisioning- of commerciële flow die toekent.

## Afdwinging

Planning wordt op vier lagen afgedwongen:

- navigatie verbergt Planning zonder entitlement;
- de server-rendered Planning-pagina weigert directe URL-toegang;
- de Planning API weigert handmatige requests;
- de `planning_events` RLS-policies combineren membership/rol met
  `has_company_module(company_id, 'planning')`.

`has_company_module` is een `SECURITY DEFINER` helper met vaste search path.
Alleen `authenticated` mag hem uitvoeren. De helper controleert altijd de
actuele gebruiker én membership, en retourneert voor andere tenants slechts
`false`. Dit beperkte execute-recht is nodig voor server-session checks en
voor de RLS-policies; de helper heeft geen mutatiepad.

`module_catalog` en `company_module_entitlements` hebben RLS en geen directe
Data API-rechten voor anon, authenticated of service_role. Er is geen
browser- of self-service entitlementmutatie in ENT1.

## Intrekking

Intrekken zet een entitlement op niet-actief en vult `revoked_at`; het verwijdert
geen planning-events, offertes, klanten, integriteits- of auditgegevens. Een
latere hergrant herstelt de toegang tot dezelfde bewaarde planningdata.

## Commerciële grens

Een toekomstige billinglaag kan plannen en add-ons naar
`company_module_entitlements` mappen. `subscriptions`, Stripe en checkout zijn
uitdrukkelijk niet de entitlementautoriteit in ENT1 en worden niet gewijzigd.

ENT1 implementeert geen CRM, Automation, Analytics, provider-OAuth, externe
kalenders, AI-, e-mail- of betaalprovideractivatie.
