# CONCEPT — DATA-SUBJECT-REQUESTPROCEDURE

Eigenaar: `[LEGAL_COMPANY_NAME]` · privacycontact: `[PRIVACY_EMAIL]`
Status: handmatige procedure; geen automatische verwijdering of export.

## Intake en besluitpad

1. **Registreer** datum, kanaal, verzoektype, aangewezen controller/tenant en
   verzoek-ID. Neem geen wachtwoord, raw token of volledige gevoelige inhoud op.
2. **Verifieer bevoegdheid** proportioneel. Een medewerker mag alleen handelen
   namens de juiste organisatie; escaleer twijfel, minderjarigen, gemachtigden
   of verzoeken via een publieke link.
3. **Bepaal rol en scope.** Stel vast of `[LEGAL_COMPANY_NAME]` controller of
   verwerker is en betrek bij een verwerkersverzoek de relevante installatieklant.
4. **Inventariseer** per tenant: account/membership, customer, gesprekken,
   offertes, facturen/snapshots, documenten/afbeeldingen, planning, audit/security,
   AI-runmetadata, deliverymetadata en Storage-prefixen.
5. **Toets beperkingen.** Controleer financiële bewaarplicht, legal hold,
   geschil, beveiligingsbelang, andere user-memberships en back-upretentie.
6. **Voer alleen het goedgekeurde besluit uit.** Mogelijke uitkomst: inzage,
   correctie, export, beperking, bezwaarafhandeling, wissing of gemotiveerde
   gedeeltelijke weigering. Geen ad-hoc SQL of bulkdelete.
7. **Verifieer technisch** de exacte tenant, database-relaties, Storage en
   behouden financiële snapshots. Bevestig dat een actie geen andere tenant raakt.
8. **Leg minimale evidence vast**: beslisser, scope, datum, uitgevoerde stap,
   uitzonderingen en verificatie. Geen inhoud, credentials of raw tokens.
9. **Reageer veilig** via `[PRIVACY_EMAIL]` of een geverifieerd kanaal; stuur
   alleen gegevens aan de geverifieerde ontvanger.

## Verzoektypen

| Verzoek | Minimale actie |
| --- | --- |
| Inzage | Geautoriseerde tenantinventaris, juridische review en veilige export/antwoord |
| Rectificatie | Bronrecord aanpassen via normale tenantveilige flow; snapshots niet herschrijven |
| Wissing | Retentie/legal-hold/financiële beoordeling, daarna gecontroleerde scopeactie |
| Beperking/bezwaar | Markeer besluit handmatig; stop niet automatisch kritieke integriteitstaken |
| Export | Bepaal formaat, scope en veilige aflevermethode; geen secrets of andere tenantdata |

Back-ups kunnen historische gegevens bevatten tot hun goedgekeurde expiratie.
Dat wordt transparant gecommuniceerd; back-ups worden niet individueel herschreven.
