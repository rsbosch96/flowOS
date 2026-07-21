  -- Apply outputs/database-schema.sql as migration 001 before this migration.
  -- Creates a tenant and its owner atomically for the authenticated user.
  create or replace function public.bootstrap_company(company_name text, profile_name text)
  returns text
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    new_company_id uuid;
    new_slug text;
    current_user_id uuid := auth.uid();
  begin
    if current_user_id is null then
      raise exception 'Authentication required';
    end if;
    if char_length(trim(company_name)) < 2 or char_length(trim(company_name)) > 160 then
      raise exception 'Invalid company name';
    end if;
  
    new_slug := trim(both '-' from regexp_replace(lower(trim(company_name)), '[^a-z0-9]+', '-', 'g'));
    if new_slug = '' then new_slug := 'bedrijf'; end if;
    -- Native PostgreSQL expression: no pgcrypto search-path dependency.
    new_slug := new_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  
    insert into public.users (id, email, full_name)
    select id, email, trim(profile_name) from auth.users where id = current_user_id
    on conflict (id) do update set full_name = excluded.full_name, updated_at = now();
  
    insert into public.companies (name, slug)
    values (trim(company_name), new_slug)
    returning id into new_company_id;
  
    insert into public.company_memberships (company_id, user_id, role)
    values (new_company_id, current_user_id, 'owner');
    return new_slug;
  end;
  $$;
  
  revoke all on function public.bootstrap_company(text, text) from public;
  grant execute on function public.bootstrap_company(text, text) to authenticated;
