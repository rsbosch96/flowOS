# CONCEPT — RETENTIE- EN VERWIJDERBELEID

Eigenaar: `[LEGAL_COMPANY_NAME]`
Versie/effectieve datum: `[EFFECTIVE_DATE]`
Status: **niet juridisch goedgekeurd; niet automatisch uitgevoerd**

Deze tabel is een besliskader, geen vastgestelde bewaartermijn. Vul vóór echte
klantdata per categorie een minimale termijn, grondslag, eventuele bewaarplicht,
verantwoordelijke en verwijdermethode in. Financiële gegevens worden afzonderlijk
beoordeeld; deze mogen niet via een gewone accountcleanup verdwijnen.

| Categorie | Voorlopige termijn | Einde / verwijdering of anonimisering | Back-upbehandeling | Besluit nodig |
| --- | --- | --- | --- | --- |
| Bedrijfsprofiel en memberships | `[LEGAL RETENTION DECISION REQUIRED]` | Toegang intrekken; gegevens pas verwijderen volgens goedgekeurd offboardingplan | Kan bestaan tot back-upexpiratie | Termijn en controllerrol |
| Gebruikers en Auth-identiteiten | `[LEGAL RETENTION DECISION REQUIRED]` | Membership eerst intrekken; gedeelde gebruiker bij andere organisatie behouden | Kan bestaan tot back-upexpiratie | Auth-/accountbeleid |
| Klanten en contact/adresgegevens | `[LEGAL RETENTION DECISION REQUIRED]` | Per tenant verwijderen/anonymiseren waar geen wettelijke plicht bestaat | Kan bestaan tot back-upexpiratie | Instructie controller |
| Offertes, publieke-linkmetadata en beslissingen | `[LEGAL RETENTION DECISION REQUIRED]` | Links intrekken; recordrelaties alleen na integriteitscontrole behandelen | Kan bestaan tot back-upexpiratie | Contract-/geschillenbeleid |
| Facturen en immutable snapshots | **Apart financieel besluit vereist** | Niet ad-hoc verwijderen of wijzigen; bewaarplicht en correctieproces juridisch vaststellen | Back-up volgens financieel beleid | Fiscale termijn en legal hold |
| Gesprekken en berichten | `[LEGAL RETENTION DECISION REQUIRED]` | Per tenant verwijderen/anonymiseren na goedkeuring | Kan bestaan tot back-upexpiratie | Support-/geschillenbeleid |
| Documenten en productafbeeldingen | `[LEGAL RETENTION DECISION REQUIRED]` | Databaseverwijzing én exact private Storage-prefix volgens goedgekeurde procedure | Afzonderlijke Storage-back-up; expireert volgens beleid | Bestanden, persoonsgegevens, bewijs |
| Planning-items | `[LEGAL RETENTION DECISION REQUIRED]` | Annuleren is niet verwijderen; verwijdering alleen expliciet en auditbaar | Kan bestaan tot back-upexpiratie | Operationeel/contractueel doel |
| Audit- en securitylogs | `[LEGAL RETENTION DECISION REQUIRED]` | Minimaliseren; niet wijzigen als bewijs/incidentonderzoek nodig is | Kan bestaan tot back-upexpiratie | Proportionaliteit, securitybehoefte |
| AI-runmetadata | `[LEGAL RETENTION DECISION REQUIRED]` | Alleen metadata; geen prompt of klantdocument in `ai_runs` | Kan bestaan tot back-upexpiratie | Kosten/securityanalyse |
| E-maildeliverymetadata | `[LEGAL RETENTION DECISION REQUIRED]` | Alleen relevant zodra e-mail is ingeschakeld | Kan bestaan tot back-upexpiratie | Provider-/bewijsbeleid |
| Rate-limit- en technische runtimegegevens | `[LEGAL RETENTION DECISION REQUIRED]` | Periodiek verwijderen volgens minimale securitytermijn | Niet als zelfstandig businessrecord behandelen | Loggingbeleid |
| Back-ups en herstelbewijs | `[LEGAL RETENTION DECISION REQUIRED]` | Versleutelde rotatie; niet individueel herschrijven voor een DSR | Vernietigen na goedgekeurde expiratie | Backup-owner en termijn |

## Regels

- Een verzoek tot wissen wordt pas uitgevoerd na bevoegdheids-, tenant-,
  contract- en financiële beoordeling.
- Een legal hold, incident, geschil of wettelijke bewaarplicht blokkeert een
  gewone verwijderactie zolang dat besluit geldt.
- Back-ups zijn gevoelige kopieën. Een data-subject-verzoek kan daarin aanwezig
  blijven totdat de goedgekeurde back-upretentie afloopt; er wordt geen handmatige
  herschrijving van historische back-ups beloofd.
- Leg per uitgevoerde verwijdering de autorisatie, scope, technische verificatie
  en uitzonderingen vast zonder inhoud of secrets in het bewijs op te nemen.
- De procedure voor account-/tenantoffboarding staat in
  [offboarding-policy-foundation.md](./offboarding-policy-foundation.md).
