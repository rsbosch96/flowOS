# Planning v1

## Doel en scope

Planning v1 voegt een intern overzicht toe voor afspraken, werkzaamheden, leveringen en interne momenten. De module is additief: `planning_events` is een nieuw tenant-owned record en verwijst alleen naar bestaande Core-records. Er worden geen Core-tabellen, offerte-statussen, prijzen, BTW-bedragen, financiële snapshots of factuurimmutability aangepast.

Een planning-item kan handmatig worden gemaakt of expliciet vanuit een geaccepteerde offerte worden vooringevuld. Dit is nooit automatisch. Bij de offerte-koppeling haalt de server de klant en offerte op binnen dezelfde `company_id`; alleen een quote met status `accepted` is geldig. Het planning-item blijft daarna een zelfstandig operationeel record. De bronkoppeling en tenant worden niet wijzigbaar; annuleren is expliciet en auditbaar.

## Datamodel en tenantmodel

`planning_events` bevat de datum/tijd, type, locatie, verantwoordelijke, optionele klant en een optionele Core-bron (`quote`, `conversation` of `invoice`).

- RLS: leden mogen alleen events van hun organisatie lezen. Alleen owners en employees mogen maken of wijzigen; technicians kunnen alleen lezen.
- ACL: `anon` en `service_role` krijgen geen directe tabelrechten. Authenticated krijgt alleen `SELECT`, `INSERT` en `UPDATE`; er is geen directe `DELETE`.
- Database trigger: valideert voor elke insert/update dat alle gekoppelde records dezelfde `company_id` hebben. Daarmee wordt bijvoorbeeld `company_id = A` met `quote_id = B` op databaseniveau geweigerd, ook buiten de Next.js-route.
- Database trigger: quote-bronnen moeten geaccepteerd zijn; bronkoppelingen zijn na creatie onveranderlijk. De trigger schrijft ook veilige, minimale auditmetadata voor `planning.created`, `planning.updated` en `planning.cancelled`.

## Core-koppelingen

Planning leest `companies`, `company_memberships`, `customers`, `conversations`, `quotes`, `invoices`, `users` en `audit_logs`. Nieuwe foreign keys verwijzen uitsluitend naar deze tabellen. `tasks` blijft bewust een apart kortcyclisch actielijstconcept; een planning-event is een tijdgebonden operationeel moment.

## Toekomstige Calendar Provider Boundary

De centrale bron blijft `planning_events`. Een toekomstige aparte synchronisatielaag kan provider-neutrale mappings toevoegen met bijvoorbeeld `planning_event_id`, `provider`, `external_event_id`, `last_synced_at` en een idempotency-sleutel. Create/update/cancel-sync moet dan outbox-gedreven en idempotent worden gemaakt. PL1 bevat geen provider-SDK, OAuth, credentials, providervelden, Google Calendar- of Microsoft Graph-code.

## Bewust niet gebouwd

Geen automatische planning na offerteacceptatie, externe calendars, reminders, SMS, routeoptimalisatie, roosters, urenregistratie, resourceplanning, drag-and-drop, herhaling, AI-planning, klantportaalplanning of uitgebreide notificaties.
