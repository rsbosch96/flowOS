# Product backlog

## BACKLOG-QUOTE-001 — Scheid klant- en interne offerte-notities

`quotes.notes` is vrije tekst en blijft voor bestaande interne offerte- en factuurflows beschikbaar. Voeg in een afzonderlijk werkpakket expliciete klant- en interne notitievelden toe, inclusief migratie, autorisatie, UI-labels en een veilige migratiestrategie voor bestaande data. Tot die tijd mag `quotes.notes` niet via publieke offertelinks worden gepubliceerd.

## INFRA-001 — Lokale en remote Supabase-migratiegeschiedenis synchroniseren

Leg één reproduceerbare bron van waarheid vast voor database-migraties en provisioning. Vergelijk vóór de externe pilot de lokale migratiebestanden met de remote `schema_migrations`-geschiedenis, documenteer handmatig via de SQL Editor toegepaste wijzigingen en leg een vaste procedure vast voor nieuwe migraties. Voorkom daarmee dat `supabase db push`, CI/CD of een verse omgeving reeds toegepaste schemawijzigingen opnieuw probeert uit te voeren. Neem de remote tijdstempelregistratie van `027_fix_invoice_fiscal_year_ambiguity` expliciet mee in deze reconciliatie.
