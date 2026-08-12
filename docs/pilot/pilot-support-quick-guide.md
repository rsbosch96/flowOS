# FlowOS pilot — support quick guide

Gebruik dit naast [pilot-support.md](../operations/pilot-support.md) en
[incident-response.md](../operations/incident-response.md). Het vervangt die
runbooks niet.

## Eerste reactie

1. Bevestig ontvangst en vraag alleen om: organisatie, pagina/URL zonder token,
   tijdstip, wat iemand wilde doen, foutmelding en zo nodig screenshot.
2. Vraag nooit om wachtwoorden, API-sleutels, JWT's, raw publieke offertokens of
   volledige klantdocumenten.
3. Leg een request-ID vast wanneer de gebruiker die ziet.
4. Zeg niet dat een fout is opgelost voordat deze is geverifieerd.

## Snel triëren

| Niveau | Voorbeeld | Actie |
| --- | --- | --- |
| SEV-1 | Vermoeden tenantlek, datalek of volledige onbeschikbaarheid | Stop, bewaar veilig bewijs en escaleer direct volgens incidentrunbook |
| SEV-2 | Offerte/factuurflow blokkeert een pilotbedrijf | Controleer health, logs en veilige context; houd eigenaar op de hoogte |
| SEV-3 | Niet-kritieke fout met workaround | Registreer, communiceer workaround en plan opvolging |

## Veilige controles

- Controleer `/api/health` en de UptimeRobot-status.
- Bekijk Vercel- en Supabase-logs met request-ID waar beschikbaar.
- Controleer tenant- en rolcontext vóór je een probleem reproduceert.
- Stop bij twijfel over financiële data, tenantgrenzen, publieke links of
  persoonsgegevens. Doe geen handmatige databasewijziging zonder goedkeuring.

OpenAI, Resend, Stripe en externe agenda's blijven uit. Een supportactie mag
deze providers niet activeren.
