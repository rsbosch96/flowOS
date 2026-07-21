-- Convenience migration for existing local installations.
-- Run only after 001 database schema and 002 onboarding migration.
drop policy if exists "tenant ai runs" on public.ai_runs;
drop policy if exists "tenant ai runs read" on public.ai_runs;
drop policy if exists "tenant ai runs insert" on public.ai_runs;
drop policy if exists "tenant ai runs update" on public.ai_runs;
create policy "tenant ai runs read" on public.ai_runs for select to authenticated using (public.is_company_member(company_id));
create policy "tenant ai runs insert" on public.ai_runs for insert to authenticated with check (public.is_company_member(company_id));
create policy "tenant ai runs update" on public.ai_runs for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

drop policy if exists "members insert audit logs" on public.audit_logs;
create policy "members insert audit logs" on public.audit_logs for insert to authenticated with check (company_id is not null and public.is_company_member(company_id));

create or replace function public.start_ai_run(target_company_id uuid, requested_kind text, requested_prompt_version text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_run_id uuid;
begin
  if auth.uid() is null or not public.is_company_member(target_company_id) then raise exception 'Not allowed for this company'; end if;
  if requested_kind not in ('document_extraction', 'quote_generation', 'reply_draft') then raise exception 'Invalid AI job type'; end if;
  insert into public.ai_runs (company_id, initiated_by, kind, status, prompt_version, started_at) values (target_company_id, auth.uid(), requested_kind, 'running', requested_prompt_version, now()) returning id into new_run_id;
  return new_run_id;
end;
$$;

create or replace function public.finish_ai_run(target_run_id uuid, new_status public.ai_run_status, target_quote_id uuid default null, provider_model text default null, provider_input_tokens integer default null, provider_output_tokens integer default null, failure_code text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from public.ai_runs r where r.id = target_run_id and public.is_company_member(r.company_id)) then raise exception 'Not allowed for this AI job'; end if;
  update public.ai_runs set status = new_status, quote_id = coalesce(target_quote_id, quote_id), model = coalesce(provider_model, model), input_tokens = coalesce(provider_input_tokens, input_tokens), output_tokens = coalesce(provider_output_tokens, output_tokens), error_code = failure_code, finished_at = now() where id = target_run_id;
end;
$$;

revoke all on function public.start_ai_run(uuid, text, text) from public;
revoke all on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, text) from public;
grant execute on function public.start_ai_run(uuid, text, text) to authenticated;
grant execute on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, text) to authenticated;
