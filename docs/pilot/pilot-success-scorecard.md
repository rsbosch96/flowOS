# FlowOS pilot — succes-scorecard

Gebruik alleen echte, geautoriseerde pilotorganisaties. Sluit alle
`ZZZ-PROD-SMOKE`-, regression- en andere testfixtures uit. Dit document stelt
geen grenswaarden vast; drempels zijn **[CEO DECISION REQUIRED]**.

| Thema | Signaal | Vast te leggen bewijs |
| --- | --- | --- |
| Activatie | Onboarding voltooid | Datum en organisatie-ID zonder klantinhoud |
| Activatie | Bedrijfsprofiel ingevuld | Alleen voltooid/niet voltooid |
| Activatie | Minstens één catalogusitem | Aantal, geen prijsdetails nodig |
| Activatie | Eerste echte aanvraag gemaakt | Datum en flowstatus |
| Kernwaarde | Eerste offerte gemaakt | Datum en flowstatus |
| Kernwaarde | Offerte geaccepteerd | Datum en geaggregeerde status |
| Kernwaarde | Planning gebruikt | Aantal events of ja/nee |
| Kernwaarde | Factuur gemaakt | Datum en geaggregeerde status |
| Retentie | Terugkeer na eerste sessie | Ja/nee en week |
| Retentie | Gebruik in week 2 | Ja/nee en aantal sessies/flows |
| Retentie | Meerdere offertes verwerkt | Aantalbandbreedte |
| Frictie | Blokkerende fouten | Veilige categorie, request-ID, oplossing |
| Frictie | Supportvragen | Aantal en veilige categorie |
| Frictie | Hulp van Ramon nodig | Stap en reden |
| Commercieel | Wil doorgaan | Letterlijke samenvatting, geen gevoelige details |
| Commercieel | Bereidheid te betalen | Ja/nee/onzeker; context |
| Commercieel | Koopblokker | Geprioriteerde probleemcategorie |
| Commercieel | Gewenste integratie/module | Alleen geaggregeerde vraag |

Bespreek de scorecard wekelijks. Productwijzigingen blijven bevroren tenzij een
security-, integriteits- of expliciet CEO-goedgekeurd besluit anders vereist.
