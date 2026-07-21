-- RSTECH-TASK-008: repair a project where the newer Gateway RPCs were applied
-- before the additive ai_runs columns from the earlier Gateway migration.
-- All changes are additive and preserve existing AI-run records.

alter table public.ai_runs add column if not exists duration_ms integer check (duration_ms >= 0);
alter table public.ai_runs add column if not exists total_tokens integer check (total_tokens >= 0);
alter table public.ai_runs add column if not exists error_message text;
alter table public.ai_runs add column if not exists metadata jsonb not null default '{}'::jsonb;
