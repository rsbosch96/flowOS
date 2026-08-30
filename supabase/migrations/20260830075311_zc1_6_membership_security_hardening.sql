-- ZC1.6: membership mutations are only available through controlled RPCs.
-- Existing membership rows are preserved; this migration only hardens the
-- Data API boundary and adds audited owner workflows.

drop policy if exists "owners manage memberships" on public.company_memberships;

revoke insert, update, delete on table public.company_memberships
  from anon, authenticated, service_role;
grant select on table public.company_memberships to authenticated;

create or replace function public.add_company_member_by_email(
  target_company_id uuid,
  target_email text,
  target_role public.company_role
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user_id uuid;
begin
  if auth.uid() is null
     or not public.has_company_role(target_company_id, array['owner']::public.company_role[]) then
    raise exception 'MEMBERSHIP_OWNER_REQUIRED';
  end if;

  if target_role not in ('employee', 'technician') then
    raise exception 'MEMBERSHIP_ROLE_NOT_ALLOWED';
  end if;

  select id into target_user_id
  from public.users
  where lower(email) = lower(trim(target_email));

  if target_user_id is null then
    raise exception 'MEMBERSHIP_TARGET_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.company_memberships
    where company_id = target_company_id and user_id = target_user_id
  ) then
    raise exception 'MEMBERSHIP_ALREADY_EXISTS';
  end if;

  insert into public.company_memberships (company_id, user_id, role)
  values (target_company_id, target_user_id, target_role);

  insert into public.audit_logs
    (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    auth.uid(),
    'membership.member_added',
    'company_membership',
    target_user_id,
    jsonb_build_object('target_user_id', target_user_id, 'new_role', target_role::text)
  );

  return target_user_id;
end;
$$;

create or replace function public.change_company_member_role(
  target_company_id uuid,
  target_user_id uuid,
  target_role public.company_role
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_role public.company_role;
begin
  if auth.uid() is null
     or not public.has_company_role(target_company_id, array['owner']::public.company_role[]) then
    raise exception 'MEMBERSHIP_OWNER_REQUIRED';
  end if;

  if target_role not in ('employee', 'technician') then
    raise exception 'MEMBERSHIP_ROLE_NOT_ALLOWED';
  end if;

  select role into old_role
  from public.company_memberships
  where company_id = target_company_id and user_id = target_user_id
  for update;

  if old_role is null then
    raise exception 'MEMBERSHIP_TARGET_NOT_FOUND';
  end if;

  if old_role = 'owner' or target_user_id = auth.uid() then
    raise exception 'MEMBERSHIP_OWNER_PROTECTED';
  end if;

  if old_role = target_role then
    return true;
  end if;

  update public.company_memberships
  set role = target_role
  where company_id = target_company_id and user_id = target_user_id;

  insert into public.audit_logs
    (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    auth.uid(),
    'membership.role_changed',
    'company_membership',
    target_user_id,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'old_role', old_role::text,
      'new_role', target_role::text
    )
  );

  return true;
end;
$$;

create or replace function public.remove_company_member(
  target_company_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role public.company_role;
begin
  if auth.uid() is null
     or not public.has_company_role(target_company_id, array['owner']::public.company_role[]) then
    raise exception 'MEMBERSHIP_OWNER_REQUIRED';
  end if;

  select role into target_role
  from public.company_memberships
  where company_id = target_company_id and user_id = target_user_id
  for update;

  if target_role is null then
    raise exception 'MEMBERSHIP_TARGET_NOT_FOUND';
  end if;

  if target_role = 'owner' or target_user_id = auth.uid() then
    raise exception 'MEMBERSHIP_OWNER_PROTECTED';
  end if;

  delete from public.company_memberships
  where company_id = target_company_id and user_id = target_user_id;

  insert into public.audit_logs
    (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    auth.uid(),
    'membership.member_removed',
    'company_membership',
    target_user_id,
    jsonb_build_object('target_user_id', target_user_id, 'old_role', target_role::text)
  );

  return true;
end;
$$;

revoke all on function public.add_company_member_by_email(uuid, text, public.company_role)
  from public, anon, authenticated, service_role;
revoke all on function public.change_company_member_role(uuid, uuid, public.company_role)
  from public, anon, authenticated, service_role;
revoke all on function public.remove_company_member(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.add_company_member_by_email(uuid, text, public.company_role)
  to authenticated;
grant execute on function public.change_company_member_role(uuid, uuid, public.company_role)
  to authenticated;
grant execute on function public.remove_company_member(uuid, uuid)
  to authenticated;
