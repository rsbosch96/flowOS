-- Owners can view the profiles of people in their own organisation only.
create policy "owners read company user profiles" on public.users for select to authenticated
using (exists (select 1 from public.company_memberships cm where cm.user_id = users.id and public.has_company_role(cm.company_id, array['owner']::public.company_role[])));

create or replace function public.add_company_member_by_email(target_company_id uuid, target_email text, target_role public.company_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_user_id uuid;
begin
  if auth.uid() is null or not public.has_company_role(target_company_id, array['owner']::public.company_role[]) then raise exception 'Not allowed'; end if;
  select id into target_user_id from public.users where lower(email) = lower(trim(target_email));
  if target_user_id is null then raise exception 'Deze gebruiker heeft nog geen AI FlowOS-account'; end if;
  insert into public.company_memberships (company_id, user_id, role) values (target_company_id, target_user_id, target_role)
  on conflict (company_id, user_id) do update set role = excluded.role;
  return target_user_id;
end;
$$;
revoke all on function public.add_company_member_by_email(uuid, text, public.company_role) from public;
grant execute on function public.add_company_member_by_email(uuid, text, public.company_role) to authenticated;
