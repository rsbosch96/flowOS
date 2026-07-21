# ADR-013 — Internationalization First

Status: Accepted

FlowOS ondersteunt voorlopig alleen Nederlands als producttaal, maar houdt taal, locale, valuta, land en belastingstelsel afzonderlijk. UI-teksten lopen via de centrale translation layer; identifiers, database-statussen en businessregels gebruiken nooit vertaalde tekst.

Datums, bedragen, getallen en percentages gebruiken `Intl`. AI-prompts ontvangen altijd expliciet de gevraagde outputtaal en automatische AI-vertaling vervangt geen gecontroleerde productvertaling.

Bij de huidige productomvang gebruiken we bewust een kleine interne translation layer met alleen `nl.json`: dit borgt de dure architectuurkeuzes zonder taalbestanden, databasevoorkeuren of een i18n-dependency vooruit te bouwen. De uitbreiding volgt pas bij gevalideerde vraag.

Toekomstige documenttaal volgt deze prioriteit: expliciet gevraagde documenttaal, daarna klant/document-voorkeur, daarna organisatie-default en ten slotte Nederlands als fallback.
