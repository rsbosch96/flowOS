# ADR-012 — Agent Runtime Boundary

Status: Accepted — runtime implementation deferred

De AI Gateway blijft eigenaar van providerselectie, providercommunicatie, model-call lifecycle, time-outs/retries, kostenberekening, `ai_runs`, foutnormalisatie, logging en governance-preflight.

Een toekomstige Agent Runtime wordt eigenaar van multi-step taken, planning, tool/function-calling, taakstatus, orchestratie, menselijke goedkeuring, taakresultaten en de koppeling tussen een `ai_task` en meerdere `ai_runs`. De Gateway mag niet uitgroeien tot algemene agent-orchestrator.
