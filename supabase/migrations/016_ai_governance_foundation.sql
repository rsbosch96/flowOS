-- RSTECH-GOV-001 Fase A: canonical error codes and EUR-normalized AI cost tracking.
alter table public.ai_runs add column if not exists provider text;
alter table public.ai_runs add column if not exists currency char(3) not null default 'EUR';

update public.ai_runs set provider = 'openai' where provider is null;
update public.ai_runs
set error_code = case error_code
  when 'AI_TIMEOUT' then 'TIMEOUT'
  when 'AI_RATE_LIMIT' then 'RATE_LIMIT'
  when 'AI_PROVIDER' then 'PROVIDER_ERROR'
  when 'AI_VALIDATION' then 'VALIDATION_ERROR'
  else 'UNKNOWN'
end
where error_code is not null and error_code not in ('TIMEOUT', 'RATE_LIMIT', 'BUDGET_EXCEEDED', 'PROVIDER_ERROR', 'VALIDATION_ERROR', 'UNKNOWN');

alter table public.ai_runs drop constraint if exists ai_runs_error_code_check;
alter table public.ai_runs add constraint ai_runs_error_code_check
  check (error_code is null or error_code in ('TIMEOUT', 'RATE_LIMIT', 'BUDGET_EXCEEDED', 'PROVIDER_ERROR', 'VALIDATION_ERROR', 'UNKNOWN'));
alter table public.ai_runs drop constraint if exists ai_runs_currency_check;
alter table public.ai_runs add constraint ai_runs_currency_check check (currency = 'EUR');

drop function if exists public.start_ai_run(uuid, uuid, text, text, jsonb);
drop function if exists public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, integer, integer, text, text);

create function public.start_ai_run(
  target_company_id uuid,
  target_initiated_by uuid,
  requested_kind text,
  requested_prompt_version text,
  requested_metadata jsonb,
  requested_provider text,
  requested_model text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_run_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Only the AI Gateway may create AI runs'; end if;
  if not exists (select 1 from public.company_memberships where company_id = target_company_id and user_id = target_initiated_by) then
    raise exception 'Initiator is not a member of this company';
  end if;
  if requested_kind not in ('document_extraction', 'quote_generation', 'reply_draft') then raise exception 'Invalid AI job type'; end if;
  if requested_provider <> 'openai' then raise exception 'Invalid AI provider'; end if;
  if jsonb_typeof(requested_metadata) <> 'object' then raise exception 'AI metadata must be an object'; end if;

  insert into public.ai_runs (company_id, initiated_by, kind, status, provider, model, prompt_version, metadata, currency, started_at)
  values (target_company_id, target_initiated_by, requested_kind, 'running', requested_provider, requested_model, requested_prompt_version, requested_metadata, 'EUR', now())
  returning id into new_run_id;
  return new_run_id;
end;
$$;

create function public.finish_ai_run(
  target_run_id uuid,
  new_status public.ai_run_status,
  target_quote_id uuid default null,
  provider_name text default null,
  provider_model text default null,
  provider_input_tokens integer default null,
  provider_output_tokens integer default null,
  provider_total_tokens integer default null,
  provider_duration_ms integer default null,
  provider_estimated_cost_cents integer default null,
  cost_currency char(3) default 'EUR',
  failure_code text default null,
  safe_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Only the AI Gateway may finish AI runs'; end if;
  if new_status not in ('succeeded', 'failed') then raise exception 'Invalid AI completion status'; end if;
  if provider_name is not null and provider_name <> 'openai' then raise exception 'Invalid AI provider'; end if;
  if cost_currency <> 'EUR' then raise exception 'Unsupported AI cost currency'; end if;
  if failure_code is not null and failure_code not in ('TIMEOUT', 'RATE_LIMIT', 'BUDGET_EXCEEDED', 'PROVIDER_ERROR', 'VALIDATION_ERROR', 'UNKNOWN') then
    raise exception 'Invalid AI error code';
  end if;

  update public.ai_runs
  set status = new_status,
      quote_id = coalesce(target_quote_id, quote_id),
      provider = coalesce(provider_name, provider),
      model = coalesce(provider_model, model),
      input_tokens = coalesce(provider_input_tokens, input_tokens),
      output_tokens = coalesce(provider_output_tokens, output_tokens),
      total_tokens = coalesce(provider_total_tokens, total_tokens),
      duration_ms = coalesce(provider_duration_ms, duration_ms),
      estimated_cost_cents = provider_estimated_cost_cents,
      currency = cost_currency,
      error_code = failure_code,
      error_message = safe_error_message,
      finished_at = now()
  where id = target_run_id;

  if not found then raise exception 'AI run not found'; end if;
end;
$$;

revoke all on function public.start_ai_run(uuid, uuid, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, text, integer, integer, integer, integer, integer, char, text, text) from public, anon, authenticated;
grant execute on function public.start_ai_run(uuid, uuid, text, text, jsonb, text, text) to service_role;
grant execute on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, text, integer, integer, integer, integer, integer, char, text, text) to service_role;
