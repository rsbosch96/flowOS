-- Allow authenticated members to create and update AI job records only within their own tenant.
drop policy if exists "tenant ai runs" on public.ai_runs;
drop policy if exists "tenant ai runs read" on public.ai_runs;
drop policy if exists "tenant ai runs insert" on public.ai_runs;
drop policy if exists "tenant ai runs update" on public.ai_runs;

create policy "tenant ai runs read" on public.ai_runs
  for select to authenticated
  using (public.is_company_member(company_id));

create policy "tenant ai runs insert" on public.ai_runs
  for insert to authenticated
  with check (public.is_company_member(company_id));

create policy "tenant ai runs update" on public.ai_runs
  for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
