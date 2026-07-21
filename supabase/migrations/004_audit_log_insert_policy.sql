-- Permit members to record an audit entry only for their own company.
create policy "members insert audit logs" on public.audit_logs
  for insert to authenticated
  with check (company_id is not null and public.is_company_member(company_id));
