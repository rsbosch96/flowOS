-- RSTECH-TASK-001: minimale metadata voor Gateway-runs, zonder prompts of klantinhoud.
alter table public.ai_runs add column if not exists duration_ms integer check (duration_ms >= 0);
alter table public.ai_runs add column if not exists total_tokens integer check (total_tokens >= 0);
alter table public.ai_runs add column if not exists error_message text;
alter table public.ai_runs add column if not exists metadata jsonb not null default '{}'::jsonb;

create or replace function public.finish_ai_run(target_run_id uuid, new_status public.ai_run_status, target_quote_id uuid default null, provider_model text default null, provider_input_tokens integer default null, provider_output_tokens integer default null, failure_code text default null, provider_duration_ms integer default null, provider_total_tokens integer default null, safe_error_message text default null, run_metadata jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from public.ai_runs r where r.id = target_run_id and public.is_company_member(r.company_id)) then raise exception 'Not allowed for this AI job'; end if;
  update public.ai_runs set status = new_status, quote_id = coalesce(target_quote_id, quote_id), model = coalesce(provider_model, model), input_tokens = coalesce(provider_input_tokens, input_tokens), output_tokens = coalesce(provider_output_tokens, output_tokens), total_tokens = coalesce(provider_total_tokens, total_tokens), duration_ms = coalesce(provider_duration_ms, duration_ms), error_code = failure_code, error_message = safe_error_message, metadata = coalesce(run_metadata, metadata), finished_at = now() where id = target_run_id;
end;
$$;
revoke all on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, text, integer, integer, text, jsonb) from public;
grant execute on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, text, integer, integer, text, jsonb) to authenticated;
