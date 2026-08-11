# CONCEPT — OFF1 BELEIDSFUNDAMENT; GEEN AUTOMATISERING

Een tenantoffboarding is een gecontroleerd verzoek, geen bulkdelete. Dit
document wijzigt geen data en de daadwerkelijke OFF1-implementatie blijft
geblokkeerd tot een apart ontwerp, juridische retentiebesluiten en CEO-goedkeuring.

## Verplichte volgorde

1. Verifieer opdrachtgever, company, scope, contracteinde, legal hold en
   financiële bewaarplichten.
2. Trek publieke offertelinks eerst in en leg de scope/auditvastlegging vast.
3. Trek memberships in. Verwijder of disable een Auth-user niet wanneer deze
   nog lid is van een andere organisatie.
4. Schakel optionele module-entitlements uit zonder planning- of Core-data te
   verwijderen.
5. Inventariseer klanten, offertes, facturen/snapshots, gesprekken, documenten,
   afbeeldingen, planning, auditrecords en back-ups per `company_id`.
6. Bepaal per categorie de goedgekeurde retentie, export- en legal-holdactie.
   Facturen en immutable snapshots volgen nooit een gewone verwijderactie.
7. Verwijder Storage uitsluitend met een gecontroleerde, server-side inventaris
   van het exacte tenantprefix; geen glob of pad van de browser vertrouwen.
8. Verifieer database-, Storage-, membership- en audituitkomst; bewaar alleen
   minimaal, veilig offboardingbewijs.

## Harde grenzen

- Een planning-item blijft een zelfstandig operationeel/auditbaar record tot
  de expliciete lifecyclebeslissing; offertewijzigingen mogen het niet stilzwijgend
  verwijderen.
- Back-ups worden niet per individu of tenant herschreven. Zij verlopen volgens
  de goedgekeurde versleutelde back-upretentie.
- Geen automatische hard-delete, geen reset en geen wijziging van financiële
  snapshots zonder afzonderlijk besluit.

Zie [data-retention.md](./data-retention.md) en
[data-subject-requests.md](../operations/data-subject-requests.md).
