# Onbekende AI-kosten — fail-closed contract

Budgetstatussen zijn: `disabled`, `unlimited`, `ok`, `warning`, `exceeded` en `unknown`. `ai_runs.estimated_cost_cents = NULL` betekent onbekend en mag nooit als nul worden behandeld.

Een toekomstige budget-engine rapporteert altijd `unknown_cost_run_count` en `known_spend_cents`. Als een actief budget niet betrouwbaar is door onbekende kosten, doet de Gateway standaard geen nieuwe betaalde provider-aanroep en retourneert zij `BUDGET_STATUS_UNKNOWN`, tenzij een strengere blokkadestatus geldt. Deze taak implementeert bewust geen budget-engine.
