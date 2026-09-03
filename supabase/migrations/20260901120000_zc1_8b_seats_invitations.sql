-- ZC1.8B: tenant-safe seats and invitations. No provider or billing mutation.
create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  normalized_email text not null,
  role public.company_role not null,
  token_hash text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  invited_by uuid references public.users(id) on delete set null,
  accepted_by uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_invitations_role_check check (role in ('employee','technician')),
  constraint company_invitations_status_check check (status in ('pending','accepted','revoked','expired')),
  constraint company_invitations_email_check check (normalized_email = lower(btrim(normalized_email)) and char_length(normalized_email) between 3 and 254 and normalized_email like '%@%'),
  constraint company_invitations_state_check check (
    (status = 'pending' and accepted_at is null and accepted_by is null and revoked_at is null and revoked_by is null)
    or (status = 'accepted' and accepted_at is not null and accepted_by is not null and revoked_at is null and revoked_by is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by is not null and accepted_at is null and accepted_by is null)
    or (status = 'expired' and accepted_at is null and accepted_by is null and revoked_at is null and revoked_by is null)
  ),
  constraint company_invitations_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists company_invitations_pending_email_key
  on public.company_invitations(company_id, normalized_email) where status = 'pending';
create index if not exists company_invitations_company_status_idx on public.company_invitations(company_id, status, expires_at);
create index if not exists company_invitations_token_hash_idx on public.company_invitations(token_hash);

alter table public.company_invitations enable row level security;
revoke all on table public.company_invitations from public, anon, authenticated;
grant select on table public.company_invitations to service_role;
grant insert, update, delete on table public.company_invitations to service_role;

create or replace function public.expire_company_invitations(target_company_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare changed integer;
begin
  update public.company_invitations
  set status = 'expired', updated_at = now()
  where company_id = target_company_id and status = 'pending' and expires_at <= now();
  get diagnostics changed = row_count;
  if changed > 0 then
    insert into public.audit_logs(company_id, actor_user_id, action, entity_type, metadata)
    values (target_company_id, auth.uid(), 'invitation.expired', 'company_invitation', jsonb_build_object('count', changed));
  end if;
  return changed;
end;
$$;

create or replace function public.company_seat_limit(target_company_id uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select s.included_seats from public.subscriptions s where s.company_id = target_company_id and s.is_primary and s.status in ('trialing','active','past_due','grace_period','suspended') order by s.updated_at desc limit 1), 0)
       + coalesce((select sum(i.quantity) from public.subscription_items i join public.subscriptions s on s.id = i.subscription_id where s.company_id = target_company_id and s.is_primary and s.status in ('trialing','active','past_due','grace_period','suspended') and i.item_type = 'seat' and i.item_code = 'extra_seat' and i.status = 'active'), 0)::integer;
$$;

create or replace function public.company_seat_usage(target_company_id uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*)::integer from public.company_memberships where company_id = target_company_id)
       + (select count(*)::integer from public.company_invitations where company_id = target_company_id and status = 'pending' and expires_at > now());
$$;

create or replace function public.create_company_invitation(target_company_id uuid, target_email text, target_role public.company_role)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); normalized text := lower(btrim(target_email)); token text; hash text; invitation public.company_invitations; member_exists boolean; current_status public.subscription_status; limit_value integer; usage_value integer;
begin
  if actor is null or not public.has_company_role(target_company_id, array['owner']::public.company_role[]) then raise exception 'MEMBERSHIP_OWNER_REQUIRED'; end if;
  if target_role not in ('employee','technician') then raise exception 'INVITATION_ROLE_NOT_ALLOWED'; end if;
  if normalized is null or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVITATION_EMAIL_INVALID'; end if;
  perform 1 from public.companies where id = target_company_id for update;
  if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
  perform public.expire_company_invitations(target_company_id);
  select s.status into current_status from public.subscriptions s where s.company_id = target_company_id and s.is_primary and s.status in ('trialing','active','past_due','grace_period','suspended') order by s.updated_at desc limit 1;
  if current_status is null then raise exception 'COMMERCIAL_SUBSCRIPTION_REQUIRED'; end if;
  if current_status = 'suspended' then raise exception 'COMMERCIAL_SUBSCRIPTION_REQUIRED'; end if;
  select exists(select 1 from public.company_memberships cm join auth.users au on au.id = cm.user_id where cm.company_id = target_company_id and lower(btrim(au.email)) = normalized) into member_exists;
  if member_exists then raise exception 'INVITATION_TARGET_ALREADY_MEMBER'; end if;
  if exists(select 1 from public.company_invitations where company_id = target_company_id and normalized_email = normalized and status = 'pending') then raise exception 'INVITATION_ALREADY_PENDING'; end if;
  limit_value := public.company_seat_limit(target_company_id); usage_value := public.company_seat_usage(target_company_id);
  if usage_value >= limit_value then
    insert into public.audit_logs(company_id, actor_user_id, action, entity_type, metadata) values (target_company_id, actor, 'seat.limit_denied', 'company_invitation', jsonb_build_object('seat_limit', limit_value, 'seat_usage', usage_value));
    raise exception 'SEAT_LIMIT_REACHED';
  end if;
  token := encode(extensions.gen_random_bytes(32), 'hex'); hash := encode(extensions.digest(token::text, 'sha256'::text), 'hex');
  insert into public.company_invitations(company_id, normalized_email, role, token_hash, expires_at, invited_by)
  values (target_company_id, normalized, target_role, hash, now() + interval '7 days', actor) returning * into invitation;
  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_company_id, actor, 'invitation.created', 'company_invitation', invitation.id, jsonb_build_object('role', invitation.role, 'expires_at', invitation.expires_at, 'email', normalized));
  return jsonb_build_object('id', invitation.id, 'email', invitation.normalized_email, 'role', invitation.role, 'status', invitation.status, 'expires_at', invitation.expires_at, 'token', token);
end;
$$;

create or replace function public.revoke_company_invitation(target_company_id uuid, target_invitation_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); changed boolean;
begin
  if actor is null or not public.has_company_role(target_company_id, array['owner']::public.company_role[]) then raise exception 'MEMBERSHIP_OWNER_REQUIRED'; end if;
  perform 1 from public.companies where id = target_company_id for update;
  update public.company_invitations set status='revoked', revoked_by=actor, revoked_at=now(), updated_at=now() where id=target_invitation_id and company_id=target_company_id and status='pending';
  changed := found;
  if changed then insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id) values (target_company_id, actor, 'invitation.revoked', 'company_invitation', target_invitation_id); end if;
  if not changed then raise exception 'INVITATION_NOT_FOUND'; end if;
  return true;
end;
$$;

create or replace function public.list_company_invitations(target_company_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.has_company_role(target_company_id, array['owner']::public.company_role[]) then raise exception 'MEMBERSHIP_OWNER_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.normalized_email, 'role', i.role, 'status', i.status, 'expires_at', i.expires_at, 'created_at', i.created_at) order by i.created_at desc) from public.company_invitations i where i.company_id = target_company_id), '[]'::jsonb);
end;
$$;

create or replace function public.accept_company_invitation(raw_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); email_value text; invitation public.company_invitations; company_id_value uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select lower(btrim(email)) into email_value from auth.users where id = actor;
  select company_id into company_id_value from public.company_invitations where token_hash = encode(extensions.digest(raw_token::text, 'sha256'::text), 'hex') and status = 'pending' and expires_at > now();
  if company_id_value is null then raise exception 'INVITATION_NOT_FOUND'; end if;
  perform 1 from public.companies where id = company_id_value for update;
  select * into invitation from public.company_invitations where token_hash = encode(extensions.digest(raw_token::text, 'sha256'::text), 'hex') and status = 'pending' and expires_at > now() for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if email_value is distinct from invitation.normalized_email then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;
  if not exists(select 1 from public.subscriptions s where s.company_id = invitation.company_id and s.is_primary and s.status in ('trialing','active','past_due','grace_period')) then raise exception 'COMMERCIAL_SUBSCRIPTION_REQUIRED'; end if;
  if exists(select 1 from public.company_memberships where company_id=invitation.company_id and user_id=actor) then raise exception 'INVITATION_TARGET_ALREADY_MEMBER'; end if;
  perform set_config('app.zc1_8b_membership_write', 'on', true);
  insert into public.company_memberships(company_id,user_id,role) values (invitation.company_id,actor,invitation.role);
  update public.company_invitations set status='accepted', accepted_by=actor, accepted_at=now(), updated_at=now() where id=invitation.id;
  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, metadata) values (invitation.company_id, actor, 'invitation.accepted', 'company_invitation', invitation.id, jsonb_build_object('source','invitation','role',invitation.role));
  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, metadata) values (invitation.company_id, actor, 'membership.member_added', 'membership', actor, jsonb_build_object('source','invitation','invitation_id',invitation.id,'role',invitation.role));
  return jsonb_build_object('company_id', invitation.company_id, 'membership_id', jsonb_build_object('company_id', invitation.company_id, 'user_id', actor));
end;
$$;

revoke all on function public.expire_company_invitations(uuid) from public, anon, authenticated, service_role;
revoke all on function public.company_seat_limit(uuid) from public, anon, authenticated, service_role;
revoke all on function public.company_seat_usage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_company_invitation(uuid,text,public.company_role) from public, anon, authenticated, service_role;
revoke all on function public.revoke_company_invitation(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_company_invitations(uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_company_invitation(text) from public, anon, authenticated, service_role;
grant execute on function public.create_company_invitation(uuid,text,public.company_role) to authenticated;
grant execute on function public.revoke_company_invitation(uuid,uuid) to authenticated;
grant execute on function public.list_company_invitations(uuid) to authenticated;
grant execute on function public.accept_company_invitation(text) to authenticated;

-- The legacy RPC is retained for historical migrations but is no longer a normal client authority.
revoke all on function public.add_company_member_by_email(uuid,text,public.company_role) from public, anon, authenticated, service_role;

create or replace function public.guard_membership_company_capacity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare company_id_value uuid := coalesce(new.company_id, old.company_id); limit_value integer; usage_value integer;
begin
  if tg_op = 'INSERT' and current_setting('app.zc1_8b_membership_write', true) <> 'on' then
    perform 1 from public.companies where id = company_id_value for update;
    limit_value := public.company_seat_limit(company_id_value); usage_value := public.company_seat_usage(company_id_value);
    if limit_value <= usage_value then raise exception 'SEAT_LIMIT_REACHED'; end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_membership_company_capacity() from public, anon, authenticated, service_role;
drop trigger if exists company_memberships_seat_guard on public.company_memberships;
create trigger company_memberships_seat_guard before insert on public.company_memberships for each row execute function public.guard_membership_company_capacity();

create or replace function public.guard_membership_company_lock()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.companies where id = coalesce(new.company_id, old.company_id) for update;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_membership_company_lock() from public, anon, authenticated, service_role;
drop trigger if exists company_memberships_serialization_guard on public.company_memberships;
create trigger company_memberships_serialization_guard before delete on public.company_memberships for each row execute function public.guard_membership_company_lock();

create or replace function public.guard_subscription_item_capacity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid := coalesce(new.subscription_id, old.subscription_id); company_id_value uuid; included integer; current_extra integer; old_extra integer := 0; new_extra integer := 0; proposed integer; usage_value integer;
begin
  select s.company_id, coalesce(s.included_seats, 0) into company_id_value, included from public.subscriptions s where s.id = sid;
  if company_id_value is null then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  perform 1 from public.companies where id = company_id_value for update;
  select coalesce(sum(i.quantity),0)::integer into current_extra from public.subscription_items i where i.subscription_id = sid and i.item_type='seat' and i.item_code='extra_seat' and i.status='active';
  if tg_op <> 'INSERT' and old.item_type='seat' and old.item_code='extra_seat' and old.status='active' then old_extra := old.quantity; end if;
  if tg_op <> 'DELETE' and new.item_type='seat' and new.item_code='extra_seat' and new.status='active' then new_extra := new.quantity; end if;
  proposed := included + current_extra - old_extra + new_extra;
  usage_value := public.company_seat_usage(company_id_value);
  if proposed < public.company_seat_limit(company_id_value) and usage_value > proposed then raise exception 'SEAT_CAPACITY_BELOW_USAGE'; end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_subscription_item_capacity() from public, anon, authenticated, service_role;
drop trigger if exists subscription_items_capacity_guard on public.subscription_items;
create trigger subscription_items_capacity_guard before insert or update or delete on public.subscription_items for each row execute function public.guard_subscription_item_capacity();

create or replace function public.guard_subscription_capacity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare proposed integer; current_extra integer; usage_value integer;
begin
  if tg_op = 'UPDATE' and new.included_seats is not distinct from old.included_seats then return new; end if;
  if tg_op <> 'UPDATE' then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  if new.included_seats >= coalesce(old.included_seats, 0) then return new; end if;
  perform 1 from public.companies where id = new.company_id for update;
  select coalesce(sum(i.quantity),0)::integer into current_extra from public.subscription_items i where i.subscription_id = new.id and i.item_type='seat' and i.item_code='extra_seat' and i.status='active';
  proposed := coalesce(new.included_seats,0) + current_extra;
  usage_value := public.company_seat_usage(new.company_id);
  if usage_value > proposed then raise exception 'SEAT_CAPACITY_BELOW_USAGE'; end if;
  return new;
end;
$$;
revoke all on function public.guard_subscription_capacity() from public, anon, authenticated, service_role;
drop trigger if exists subscriptions_capacity_guard on public.subscriptions;
create trigger subscriptions_capacity_guard before update on public.subscriptions for each row execute function public.guard_subscription_capacity();

alter function public.bootstrap_company(text, text) set search_path = public, pg_temp;
create or replace function public.bootstrap_company(company_name text, profile_name text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare new_company_id uuid; new_slug text; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(company_name)) < 2 or char_length(trim(company_name)) > 160 then raise exception 'Invalid company name'; end if;
  new_slug := trim(both '-' from regexp_replace(lower(trim(company_name)), '[^a-z0-9]+', '-', 'g'));
  if new_slug = '' then new_slug := 'bedrijf'; end if;
  new_slug := new_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  insert into public.users (id, email, full_name) select id, email, trim(profile_name) from auth.users where id = current_user_id on conflict (id) do update set full_name = excluded.full_name, updated_at = now();
  insert into public.companies (name, slug) values (trim(company_name), new_slug) returning id into new_company_id;
  perform set_config('app.zc1_8b_membership_write', 'on', true);
  insert into public.company_memberships (company_id, user_id, role) values (new_company_id, current_user_id, 'owner');
  return new_slug;
end;
$$;
revoke all on function public.bootstrap_company(text,text) from public, anon, authenticated, service_role;
grant execute on function public.bootstrap_company(text,text) to authenticated;
