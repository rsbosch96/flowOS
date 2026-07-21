# ADR-011 — AI Task / AI Run-hiërarchie

Status: Accepted — implementation deferred

`ai_runs` representeert precies één provider- of modelaanroep. Een toekomstig `ai_task` of `agent_run` representeert één zakelijke AI-taak en kan nul of meer `ai_runs` bevatten. Kosten, status en duur moeten later op beide niveaus aggregeerbaar zijn.

Budgetten mogen voorlopig op `ai_runs` baseren. Het schema voor `ai_tasks` wordt pas in Sprint 1.6 toegevoegd; deze beslissing voegt geen tabel of kolom toe.
