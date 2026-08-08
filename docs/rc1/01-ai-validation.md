# RC1 — voorbereiding echte AI-validatie

## Doel en harde grens

Deze voorbereiding definieert één begrensde RC1-spike voor de bestaande keten:

`gesprek/aanvraag → AI Gateway → exacte catalogusmatching → atomair conceptofferte → bestaande offerte-editor`

De spike is **geen** productierelease en zet AI niet permanent live. De vijf vaste
scenario's en hun ground truth hieronder zijn vóór de live-run vastgelegd en mogen
daarna niet worden aangepast. Alleen de resultatensectie mag na de test worden ingevuld.

Tijdens deze voorbereiding zijn geen OpenAI-aanroepen, e-mails, migraties of
databasewrites uitgevoerd. `AI_MODE` blijft `mock`.

## Huidige configuratie-audit

| Onderdeel | Vastgesteld | Beoordeling |
| --- | --- | --- |
| Huidige modus | `AI_MODE=mock` | Veilig; geen betaalde provider-call mogelijk via de provider. |
| Provider | OpenAI via de centrale AI Gateway en `POST /v1/responses` | Gecentraliseerd en server-only. |
| Live modelresolutie | `gpt-5.6-luna` uit `OPENAI_QUOTE_MODEL` | Geconfigureerd, maar nog niet met een toegestane live-call op beschikbaarheid geverifieerd. |
| Fallbackmodel | `gpt-5.2` wanneer geen voorkeursmodel en geen model-env is gezet | Codepad aanwezig. |
| API-sleutel | Aanwezig; waarde niet geïnspecteerd of gelogd | Technisch geconfigureerd. |
| Response-formaat | Responses API met JSON-object en Zod-validatie | Goed voor de bestaande outputcontracten. |
| Timeout | Vaste `AbortSignal.timeout(45_000)` | Bestaat, maar is niet via `AI_TIMEOUT_MS` configureerbaar. |
| Retries | Geen | Goed voor een spike: nul automatische retries. |
| Output-tokenplafond | Niet ingesteld | **Blokker**: de provider-aanroep verzendt geen `max_output_tokens`. |
| Input-tokenplafond | Niet ingesteld | **Blokker**: alleen aanvraagtekst is op 30.000 tekens begrensd; de totale prompt is niet op tokens begrensd. |
| `ai_runs` | Provider, model, input/output/totaal tokens, duur, kosten, valuta, status en foutcode bestaan live | Loggingcontract aanwezig. |
| Kostenconfiguratie | `AI_MODEL_PRICING_JSON` en `AI_USD_EUR_RATE` ontbreken | **Blokker**: `estimated_cost_cents` wordt dan terecht `NULL`. |
| Foutafhandeling | `TIMEOUT`, `RATE_LIMIT`, `PROVIDER_ERROR`, `VALIDATION_ERROR`, `UNKNOWN` en budgetcodes | Getypeerd; browser krijgt veilige generieke meldingen. |
| Circuit breaker | Niet aangetroffen in de actieve uitvoeringsketen | Niet vereist voor deze nul-retry spike, maar vereist vóór bredere livegang. |

De Responses API ondersteunt een output-tokenlimiet en rapporteert tokengebruik;
de huidige FlowOS-aanroep benut de eerste beveiliging nog niet. Zie de
[OpenAI Responses API-referentie](https://platform.openai.com/docs/api-reference/responses-streaming/response/refusal/delta?lang=curl).

### Huidige beveiligings- en prijsgrenzen

- De modelprompt verbiedt prijzen, btw, kortingen en totalen.
- De route geeft het model uitsluitend actieve catalogusnaam, SKU en eenheid;
  nooit catalogusprijzen of btw.
- Na AI-uitvoer matcht de server uitsluitend exact (locale-genormaliseerd) op
  actieve catalogusnaam. Onbekende regels worden niet als quote item opgeslagen.
- De beveiligde draft-RPC leest prijs, btw en eenheid server-side uit de catalogus
  en slaat quote en quote-items atomair op.
- De gateway schrijft één `ai_runs`-record en markeert dit bij een fout als
  `failed`; opslag vindt pas plaats nadat de output is gevalideerd.

## Gekozen RC1-testcatalogus

Testorganisatie: `RSTech` (`rstech-dbe20d`), met 12 actieve catalogusitems.
Deze gegevens zijn alleen testgrondslag. Prijzen en btw zijn bewust niet in dit
document opgenomen en worden niet aan het model gegeven.

| Catalogusproduct | SKU | Eenheid | Actief |
| --- | --- | --- | --- |
| Extra groep meterkast zonnepanelen | `ELEC-GROUP-PV` | stuk | ja |
| Growatt omvormer 5kW | `SOL-INV-GROW-5K` | stuk | ja |
| Growatt omvormer 8kW | `SOL-INV-GROW-8K` | stuk | ja |
| Growatt thuisbatterij 10kWh | `BAT-GROW-10` | stuk | ja |
| Growatt thuisbatterij 5kWh | `BAT-GROW-5` | stuk | ja |
| Installatie thuisbatterij | `BAT-INSTALL` | stuk | ja |
| Installatie zonnepanelen | `SOL-INSTALL` | uur | ja |
| MC4 connector set | `SOL-CON-MC4` | stuk | ja |
| Montageset pannendak per paneel | `SOL-MOUNT-TILE` | stuk | ja |
| Solar DC-kabel 6mm² | `SOL-CABLE-DC` | stuk | ja |
| Voorrijkosten | `SOL-CALL` | rit | ja |
| Zonnepaneel 450Wp zwart | `SOL-PANEL-450` | stuk | ja |

## Vaste scenario's en ground truth

### S1 — zeer duidelijke zonnepanelenaanvraag

**Aanvraagtekst**

> Wij willen 10 Zonnepaneel 450Wp zwart op een pannendak. Neem precies 10
> Montageset pannendak per paneel en 8 uur Installatie zonnepanelen op. Geen
> omvormer, bekabeling of thuisbatterij in deze aanvraag.

| Onderdeel | Vastgelegde verwachting |
| --- | --- |
| Verwachte producten | Zonnepaneel 450Wp zwart × 10; Montageset pannendak per paneel × 10; Installatie zonnepanelen × 8 uur |
| Optioneel | Geen |
| Verboden selectie | Alle overige catalogusproducten, in het bijzonder omvormers, kabel, MC4, meterkastgroep en thuisbatterij |
| Aannames/vragen | Geen noodzakelijke; een eventuele planningsaanname is acceptabel |
| Niet veilig afleidbaar | Dakmaat, kabeltraject, omvormerkeuze, meterkastaanpassing |

### S2 — duidelijke aanvraag met optioneel product

**Aanvraagtekst**

> Graag één Growatt thuisbatterij 5kWh met één Installatie thuisbatterij.
> Een Extra groep meterkast zonnepanelen is alleen een optie: neem die niet
> automatisch op, maar vraag eerst of onze bestaande groep geschikt is.

| Onderdeel | Vastgelegde verwachting |
| --- | --- |
| Verwachte producten | Growatt thuisbatterij 5kWh × 1; Installatie thuisbatterij × 1 |
| Optioneel | Extra groep meterkast zonnepanelen × 1; alleen als expliciet als optie/vraag verwerkt, niet als verplichte regel |
| Verboden selectie | Alle overige catalogusproducten |
| Aannames/vragen | Vraag naar geschiktheid van de bestaande groep; geen technische geschiktheid verzinnen |
| Niet veilig afleidbaar | Staat/grootte van meterkast en noodzaak van extra groep |

### S3 — ontbrekende kerninformatie

**Aanvraagtekst**

> Ik wil graag een Growatt thuisbatterij, maar weet niet of 5kWh of 10kWh past.
> Maak alvast een offerte zonder zelf een capaciteit te kiezen.

| Onderdeel | Vastgelegde verwachting |
| --- | --- |
| Verwachte producten | Geen daadwerkelijke quote-items totdat capaciteit is bevestigd |
| Optioneel | Growatt thuisbatterij 5kWh óf Growatt thuisbatterij 10kWh, maar niet beide en niet als definitieve regel |
| Verboden selectie | Een batterijcapaciteit als definitieve keuze; Installatie thuisbatterij zonder gekozen batterij |
| Aannames/vragen | Verplichte klantvraag: kies 5kWh of 10kWh / verstrek verbruiks- en aansluitgegevens |
| Niet veilig afleidbaar | Benodigde opslagcapaciteit en geschikte installatie |
| Veilige route-uitkomst | Geen draft en een nette validatiemelding is correct; er mag geen half concept ontstaan |

### S4 — rommelige natuurlijke klanttekst

**Aanvraagtekst**

> Hoi, wij willen waarschijnlijk 6 zwarte 450Wp panelen op pannen, ergens eind
> september. Kun je ook 6 sets voor het dak en 5 uur montage rekenen? Voor de
> dc-kabel is het ongeveer 15 meter denk ik, maar ik weet niet welke set jullie
> daarvoor gebruiken. Bel me anders even.

| Onderdeel | Vastgelegde verwachting |
| --- | --- |
| Verwachte producten | Zonnepaneel 450Wp zwart × 6; Montageset pannendak per paneel × 6; Installatie zonnepanelen × 5 uur |
| Optioneel | Geen |
| Verboden selectie | Solar DC-kabel 6mm² met een verzonnen aantal; MC4 connector set; omvormers; thuisbatterijen |
| Aannames/vragen | Vraag naar kabeltraject/benodigd pakket en exacte planning; 15 meter is niet veilig te vertalen naar cataloguseenheid `stuk` |
| Niet veilig afleidbaar | Kabelhoeveelheid, connectorbehoefte, omvormer, definitieve plandatum |

### S5 — bewust niet-catalogusproduct

**Aanvraagtekst**

> Ik wil een 11kW-laadpaal met twee RFID-passen laten plaatsen. Graag één
> laadpaal, 20 meter grondkabel en montage. Ik wil geen zonnepanelen of batterij.

| Onderdeel | Vastgelegde verwachting |
| --- | --- |
| Verwachte producten | Geen; laadpaal, RFID-passen en grondkabel staan niet in de actieve catalogus |
| Optioneel | Geen |
| Verboden selectie | Elk huidig catalogusproduct, vooral zonnepanelen, batterij, omvormers en Solar DC-kabel 6mm² |
| Aannames/vragen | Meld dat de gevraagde producten niet als actieve catalogusregels beschikbaar zijn en vraag om opvolging |
| Niet veilig afleidbaar | Productkeuze, prijs, installatieomvang, kabeltype en aantallen |
| Veilige route-uitkomst | Geen draft en geen €0,00-regel; een veilige validatiefout is correct |

## Objectief scoremodel

Per scenario worden alleen de vóór de test vastgelegde verplichte producten in
productprecisie en -recall meegenomen. Een optioneel product telt alleen als
correct wanneer de verplichte optionele behandeling is gevolgd.

| Metriek | Berekening / beoordeling |
| --- | --- |
| True positive (TP) | Verwacht catalogusproduct is geselecteerd met toegestane status |
| False positive (FP) | Niet verwacht of verboden catalogusproduct is geselecteerd |
| False negative (FN) | Verwacht product ontbreekt |
| Precision | `TP / (TP + FP)`; bij geen geselecteerde regels wordt S3/S5 alleen als veilige uitkomst beoordeeld |
| Recall | `TP / (TP + FN)`; bij S3/S5 geldt geen ontbrekend product als de veilige uitkomst is gevolgd |
| Aantalcorrectheid | Per regel: exact correct, acceptabele interpretatie, fout of niet bepaalbaar |
| Hallucinaties | Tel niet-bestaande producten, verkeerde catalogusproducten, verzonnen technische details en verzonnen klantinformatie |
| Veiligheid | Geen AI-prijs, btw of totaal; geen €0,00-niet-catalogusregel; geen tenant-/klantdatamenging |
| Bruikbaarheid | A = direct bruikbaar; B = kleine correctie; C = substantiële correctie; D = onbruikbaar; noteer geschatte correctietijd in minuten |

## Beslisgrenzen

### GO

- Geen security-, tenant- of data-integriteitsfout.
- Geen door AI verzonnen prijs, btw of totaal.
- Geen niet-catalogusregel als daadwerkelijk quote-item.
- Gemiddelde productprecision ≥ 90% en recall ≥ 80%.
- Geen kritieke hallucinatie.
- Minimaal 4 van 5 scenario's zijn A of B.
- Gemiddelde correctietijd ≤ 3 minuten.
- Gemiddelde kosten per generatie ligt onder de vooraf geconfigureerde RC1-kostengrens.

### CONDITIONAL GO

Alleen bij afgebakende prompt- of exact-matchingproblemen die met een klein
werkpakket te herstellen zijn, zonder security-, prijs-, tenant- of
data-integriteitsprobleem.

### NO GO

Eén verkeerde AI-prijs/btw/totaal, cross-tenant data, structurele
catalogushallucinatie, structureel missen van kritieke producten, onveilige
menselijke review, onacceptabele kosten/latency of onvoorspelbaar gedrag is NO GO.

## Kostenplafond en verplichte preflight

### Huidige toegestane limiet

**€0,00 en 0 live calls.** De werkelijke modeltarieven en EUR-omrekening zijn
niet geconfigureerd, en de provider heeft geen afgedwongen input- of
output-tokenlimiet. Daarom is een betrouwbare maximale kost niet berekenbaar.

### Alleen na een afzonderlijke CEO-goedgekeurde mini-hardening

De volgende limieten moeten technisch afgedwongen én vooraf in euro's berekend
zijn voordat één betaalde call is toegestaan:

| Limiet | Waarde |
| --- | --- |
| Scenariocalls | maximaal 5 |
| Automatische retries | 0 (huidig gedrag) |
| Max. input | 4.000 tokens per call |
| Max. output | 800 tokens per call via `max_output_tokens` |
| Timeout | maximaal 45 seconden |
| Absoluut RC1-spikebudget | maximaal €0,25 totaal, **alleen** wanneer de actuele modeltarieven en EUR-koers deze bovengrens aantoonbaar ondersteunen |

Preflight: vul een geldige prijsregel voor exact het live model in
`AI_MODEL_PRICING_JSON` en een positieve `AI_USD_EUR_RATE` in, bereken de
maximale vijf-calls-kost met de bovenstaande tokenlimieten en stop wanneer die
hoger is dan €0,25 of niet betrouwbaar kan worden berekend. Zonder deze
technische hardening en berekening blijft de spike verboden.

## Later live-uitvoeringsplan (alleen na CEO-goedkeuring)

1. Leg een lokale, veilige backup vast van de huidige `.env.local`; noteer nooit
   de API-sleutel in het testrapport.
2. Verifieer de voorafgaande preflight: model beschikbaar, geldige tarieven,
   EUR-koers, tokenlimieten, kostenraming ≤ €0,25 en `AI_MODE=mock`.
3. Zet uitsluitend de regel `AI_MODE` tijdelijk op `live` (of verwijder de
   mock-waarde volgens de dan geïmplementeerde modusafspraak); wijzig geen
   andere configuratie tijdens de test.
4. Start de applicatie opnieuw.
5. Voer S1 uit vanuit een nieuw testgesprek in de gekozen testorganisatie.
6. Controleer één `ai_runs`-record: status, provider, model, tokens, duur,
   kosten en veilige foutcode. Controleer de draft in de bestaande editor.
7. Corrigeer de conceptofferte niet vóór scorevastlegging. Score direct tegen
   de onveranderde ground truth.
8. Herhaal alleen bij een geslaagde kosten- en veiligheidscontrole voor S2 t/m
   S5. Geen retry; elke run verbruikt maximaal één van de vijf calls.
9. Stop onmiddellijk bij providerfout, ontbrekende/onjuiste kosten, limiet-,
   security- of tenantprobleem. Voer geen volgend scenario uit.
10. Zet direct na de vijfde of gestopte run `AI_MODE` terug naar `mock`.
11. Start de applicatie opnieuw en verifieer met één lokale mock-test dat geen
    verdere betaalde call mogelijk is.
12. Vul uitsluitend de resultatentabel in en maak het GO/CONDITIONAL GO/NO GO-
    besluit op basis van deze criteria.

## Rollback

1. Huidige waarde: `AI_MODE=mock`.
2. De enige tijdelijke configuratiewijziging is de regel `AI_MODE`.
3. Herstel die regel naar exact `AI_MODE=mock` en start de app opnieuw.
4. Bevestig mockmodus zonder provider-call: een mockconcept heeft provider/model
   `openai`/`mock` in `ai_runs` of volgt de bestaande mock-output.
5. Zoek alle spike-runs op tijdvenster en controleer op `status=failed` of een
   ontbrekend `quote_id`. Verwijder geen data.
6. Een mislukte provider- of validatierun mag geen half draft opleveren: de
   persist-stap draait pas na valide output en de draft-RPC is atomair. Als een
   afwijking wordt gezien: stop, bewaar bewijsmateriaal en open geen vervolgcall.

## Resultaten — pas invullen na live spike

| Scenario | Run-ID | Provider/model | Input/output tokens | Duur (ms) | Kosten (cent) | TP/FP/FN | Aantallen | Hallucinaties | Veiligheid | Klasse | Correctietijd (min) | Resultaat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 |  |  |  |  |  |  |  |  |  |  |  |  |
| S2 |  |  |  |  |  |  |  |  |  |  |  |  |
| S3 |  |  |  |  |  |  |  |  |  |  |  |  |
| S4 |  |  |  |  |  |  |  |  |  |  |  |  |
| S5 |  |  |  |  |  |  |  |  |  |  |  |  |

## Readiness verdict

**NOT READY FOR CEO-APPROVED LIVE SPIKE.**

De functionele en beveiligde keten is voorbereid, de API-sleutel is aanwezig en
mockmodus werkt. De live spike blijft geblokkeerd totdat exacte modelbeschikbaarheid,
geldige prijsconfiguratie inclusief EUR-koers en harde input/output-tokenlimieten
zijn bewezen. Daarna is een afzonderlijke, minimale meetinstrumentatie-/configuratie-
goedkeuring nodig vóór de eerste van maximaal vijf betaalde calls.
