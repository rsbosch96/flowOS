-- FS1.3: operational execution records for Field Service.
-- The module remains planned/unreleased. These tables never become financial truth.

create table public.field_service_work_order_materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  work_order_id uuid not null references public.field_service_work_orders(id) on update no action on delete cascade,
  source_kind text not null check (source_kind in ('catalog', 'external')),
  product_id uuid references public.product_catalog_items(id) on update no action on delete restrict,
  description_snapshot text not null check (char_length(btrim(description_snapshot)) between 1 and 240),
  unit_snapshot text not null check (char_length(btrim(unit_snapshot)) between 1 and 80),
  quantity numeric(12,3) not null check (quantity > 0),
  external_reason text,
  added_by uuid not null references public.users(id) on update no action on delete restrict,
  created_at timestamptz not null default now()
);

create table public.field_service_work_order_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  work_order_id uuid not null references public.field_service_work_orders(id) on update no action on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_by uuid not null references public.users(id) on update no action on delete restrict,
  created_at timestamptz not null default now()
);

create table public.field_service_work_order_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  work_order_id uuid not null references public.field_service_work_orders(id) on update no action on delete cascade,
  document_id uuid not null references public.documents(id) on update no action on delete restrict,
  evidence_type text not null check (evidence_type in ('photo', 'document', 'completion', 'other')),
  uploaded_by uuid not null references public.users(id) on update no action on delete restrict,
  created_at timestamptz not null default now(),
  unique (work_order_id, document_id)
);

create table public.field_service_work_order_signoffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  work_order_id uuid not null references public.field_service_work_orders(id) on update no action on delete cascade,
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 240),
  confirmation_method text not null check (confirmation_method in ('verbal', 'checkbox', 'signature_document')),
  confirmed_at timestamptz not null default now(),
  signature_document_id uuid references public.documents(id) on update no action on delete restrict,
  recorded_by uuid not null references public.users(id) on update no action on delete restrict,
  created_at timestamptz not null default now(),
  unique (work_order_id)
);

create index field_service_materials_company_order_idx
  on public.field_service_work_order_materials(company_id, work_order_id, created_at desc);
create index field_service_notes_company_order_idx
  on public.field_service_work_order_notes(company_id, work_order_id, created_at desc);
create index field_service_evidence_company_order_idx
  on public.field_service_work_order_evidence(company_id, work_order_id, created_at desc);
create index field_service_signoffs_company_order_idx
  on public.field_service_work_order_signoffs(company_id, work_order_id, created_at desc);

comment on table public.field_service_work_order_materials is
  'Operational usage snapshots only; prices, VAT and financial amounts are intentionally absent.';
comment on table public.field_service_work_order_notes is
  'Internal append-only notes. Note bodies never enter audit metadata or customer flows.';
comment on table public.field_service_work_order_evidence is
  'Private company-documents references. Upload and database-link failures are compensated by retry or single-object cleanup.';
comment on table public.field_service_work_order_signoffs is
  'Append-once operational sign-off metadata; no biometric or signature-vector data is stored.';

create or replace function public.require_field_service_execution_access(
  target_company_id uuid,
  target_work_order_id uuid,
  allowed_states text[]
)
returns public.field_service_work_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  work_order public.field_service_work_orders;
  actor_role public.company_role;
begin
  if auth.uid() is null then raise exception 'FIELD_SERVICE_AUTH_REQUIRED'; end if;
  if public.resolve_company_module_access(target_company_id, 'field_service') <> 'MODULE_AVAILABLE' then
    raise exception 'FIELD_SERVICE_MODULE_UNAVAILABLE';
  end if;
  select membership.role into actor_role
  from public.company_memberships membership
  where membership.company_id = target_company_id and membership.user_id = auth.uid();
  if not found then raise exception 'FIELD_SERVICE_MEMBERSHIP_REQUIRED'; end if;
  select * into work_order
  from public.field_service_work_orders
  where id = target_work_order_id and company_id = target_company_id
  for update;
  if not found then raise exception 'FIELD_SERVICE_WORK_ORDER_NOT_FOUND'; end if;
  if not (work_order.status = any(allowed_states)) then
    raise exception 'FIELD_SERVICE_EXECUTION_STATE_INVALID';
  end if;
  if actor_role in ('owner', 'employee') then return work_order; end if;
  if actor_role = 'technician' and work_order.assigned_user_id = auth.uid() then return work_order; end if;
  raise exception 'FIELD_SERVICE_ASSIGNMENT_FORBIDDEN';
end;
$$;

create or replace function public.validate_field_service_execution_links()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_company_id uuid;
  product_name text;
  product_unit text;
  product_description text;
  document_company_id uuid;
  document_path text;
  document_bucket text;
  expected_prefix text;
begin
  select company_id into order_company_id
  from public.field_service_work_orders
  where id = new.work_order_id;
  if order_company_id is null or order_company_id <> new.company_id then
    raise exception 'FIELD_SERVICE_WORK_ORDER_TENANT_MISMATCH';
  end if;

  if tg_table_name = 'field_service_work_order_materials' then
    if new.source_kind = 'catalog' then
      if new.product_id is null or new.external_reason is not null then raise exception 'FIELD_SERVICE_MATERIAL_INVALID'; end if;
      select name, unit, description into product_name, product_unit, product_description
      from public.product_catalog_items
      where id = new.product_id and company_id = new.company_id and is_active = true;
      if not found or new.description_snapshot <> coalesce(product_description, product_name) or new.unit_snapshot <> product_unit then
        raise exception 'FIELD_SERVICE_CATALOG_PRODUCT_INVALID';
      end if;
    elsif new.source_kind = 'external' then
      if new.product_id is not null or btrim(coalesce(new.external_reason, '')) = '' then
        raise exception 'FIELD_SERVICE_EXTERNAL_MATERIAL_INVALID';
      end if;
    else
      raise exception 'FIELD_SERVICE_MATERIAL_INVALID';
    end if;
    if not exists (select 1 from public.company_memberships where company_id = new.company_id and user_id = new.added_by) then
      raise exception 'FIELD_SERVICE_ACTOR_TENANT_MISMATCH';
    end if;
  elsif tg_table_name = 'field_service_work_order_notes' then
    if btrim(new.body) = '' or not exists (
      select 1 from public.company_memberships where company_id = new.company_id and user_id = new.created_by
    ) then raise exception 'FIELD_SERVICE_NOTE_INVALID'; end if;
  elsif tg_table_name = 'field_service_work_order_evidence' then
    select company_id, storage_bucket, storage_path into document_company_id, document_bucket, document_path
    from public.documents where id = new.document_id;
    expected_prefix := new.company_id::text || '/field-service/' || new.work_order_id::text || '/' || new.document_id::text || '/';
    if not found or document_company_id <> new.company_id or document_bucket <> 'company-documents' or left(document_path, char_length(expected_prefix)) <> expected_prefix then
      raise exception 'FIELD_SERVICE_DOCUMENT_TENANT_MISMATCH';
    end if;
    if not exists (select 1 from public.company_memberships where company_id = new.company_id and user_id = new.uploaded_by) then
      raise exception 'FIELD_SERVICE_ACTOR_TENANT_MISMATCH';
    end if;
  elsif tg_table_name = 'field_service_work_order_signoffs' then
    if new.confirmation_method not in ('verbal', 'checkbox', 'signature_document') then raise exception 'FIELD_SERVICE_SIGNOFF_INVALID'; end if;
    if not exists (select 1 from public.company_memberships where company_id = new.company_id and user_id = new.recorded_by) then
      raise exception 'FIELD_SERVICE_ACTOR_TENANT_MISMATCH';
    end if;
    if new.signature_document_id is not null then
      select company_id, storage_bucket, storage_path into document_company_id, document_bucket, document_path
      from public.documents where id = new.signature_document_id;
      expected_prefix := new.company_id::text || '/field-service/' || new.work_order_id::text || '/' || new.signature_document_id::text || '/';
      if not found or document_company_id <> new.company_id or document_bucket <> 'company-documents' or left(document_path, char_length(expected_prefix)) <> expected_prefix then
        raise exception 'FIELD_SERVICE_DOCUMENT_TENANT_MISMATCH';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_field_service_execution_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'FIELD_SERVICE_EXECUTION_APPEND_ONLY';
end;
$$;

create trigger field_service_materials_integrity
before insert on public.field_service_work_order_materials
for each row execute function public.validate_field_service_execution_links();
create trigger field_service_notes_integrity
before insert on public.field_service_work_order_notes
for each row execute function public.validate_field_service_execution_links();
create trigger field_service_evidence_integrity
before insert on public.field_service_work_order_evidence
for each row execute function public.validate_field_service_execution_links();
create trigger field_service_signoffs_integrity
before insert on public.field_service_work_order_signoffs
for each row execute function public.validate_field_service_execution_links();

create trigger field_service_materials_append_only
before update or delete on public.field_service_work_order_materials
for each row execute function public.prevent_field_service_execution_mutation();
create trigger field_service_notes_append_only
before update or delete on public.field_service_work_order_notes
for each row execute function public.prevent_field_service_execution_mutation();
create trigger field_service_evidence_append_only
before update or delete on public.field_service_work_order_evidence
for each row execute function public.prevent_field_service_execution_mutation();
create trigger field_service_signoffs_append_only
before update or delete on public.field_service_work_order_signoffs
for each row execute function public.prevent_field_service_execution_mutation();

create or replace function public.audit_field_service_execution_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  action_name text;
  entity_name text;
  metadata jsonb;
  actor_id uuid;
begin
  if tg_table_name = 'field_service_work_order_materials' then
    action_name := 'field_service.material_added';
    entity_name := 'field_service_work_order_material';
    metadata := jsonb_build_object('company_id', new.company_id, 'work_order_id', new.work_order_id, 'source_kind', new.source_kind);
    actor_id := coalesce(auth.uid(), new.added_by);
  elsif tg_table_name = 'field_service_work_order_notes' then
    action_name := 'field_service.note_added';
    entity_name := 'field_service_work_order_note';
    metadata := jsonb_build_object('company_id', new.company_id, 'work_order_id', new.work_order_id);
    actor_id := coalesce(auth.uid(), new.created_by);
  elsif tg_table_name = 'field_service_work_order_evidence' then
    action_name := 'field_service.evidence_added';
    entity_name := 'field_service_work_order_evidence';
    metadata := jsonb_build_object('company_id', new.company_id, 'work_order_id', new.work_order_id, 'evidence_type', new.evidence_type, 'document_id', new.document_id);
    actor_id := coalesce(auth.uid(), new.uploaded_by);
  elsif tg_table_name = 'field_service_work_order_signoffs' then
    action_name := 'field_service.signoff_recorded';
    entity_name := 'field_service_work_order_signoff';
    metadata := jsonb_build_object('company_id', new.company_id, 'work_order_id', new.work_order_id, 'confirmation_method', new.confirmation_method);
    actor_id := coalesce(auth.uid(), new.recorded_by);
  else
    return new;
  end if;
  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (new.company_id, actor_id, action_name, entity_name, new.id, metadata);
  return new;
end;
$$;

create trigger field_service_materials_audit after insert on public.field_service_work_order_materials
for each row execute function public.audit_field_service_execution_change();
create trigger field_service_notes_audit after insert on public.field_service_work_order_notes
for each row execute function public.audit_field_service_execution_change();
create trigger field_service_evidence_audit after insert on public.field_service_work_order_evidence
for each row execute function public.audit_field_service_execution_change();
create trigger field_service_signoffs_audit after insert on public.field_service_work_order_signoffs
for each row execute function public.audit_field_service_execution_change();

create or replace function public.add_field_service_material(
  target_company_id uuid,
  target_work_order_id uuid,
  target_source_kind text,
  target_product_id uuid,
  target_description text,
  target_unit text,
  target_quantity numeric,
  target_external_reason text default null
)
returns public.field_service_work_order_materials
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  created_row public.field_service_work_order_materials;
  product_row public.product_catalog_items;
begin
  perform public.require_field_service_execution_access(target_company_id, target_work_order_id, array['dispatched','in_progress']);
  if target_quantity is null or target_quantity <= 0 or target_quantity > 999999999 then raise exception 'FIELD_SERVICE_MATERIAL_QUANTITY_INVALID'; end if;
  if target_source_kind = 'catalog' then
    select * into product_row from public.product_catalog_items where id = target_product_id and company_id = target_company_id and is_active = true;
    if not found then raise exception 'FIELD_SERVICE_CATALOG_PRODUCT_INVALID'; end if;
    insert into public.field_service_work_order_materials(company_id,work_order_id,source_kind,product_id,description_snapshot,unit_snapshot,quantity,external_reason,added_by)
    values(target_company_id,target_work_order_id,'catalog',product_row.id,coalesce(product_row.description, product_row.name),product_row.unit,target_quantity,null,auth.uid()) returning * into created_row;
  elsif target_source_kind = 'external' then
    if target_product_id is not null or btrim(coalesce(target_description,'')) = '' or btrim(coalesce(target_unit,'')) = '' or btrim(coalesce(target_external_reason,'')) = '' then
      raise exception 'FIELD_SERVICE_EXTERNAL_MATERIAL_INVALID';
    end if;
    insert into public.field_service_work_order_materials(company_id,work_order_id,source_kind,description_snapshot,unit_snapshot,quantity,external_reason,added_by)
    values(target_company_id,target_work_order_id,'external',btrim(target_description),btrim(target_unit),target_quantity,btrim(target_external_reason),auth.uid()) returning * into created_row;
  else raise exception 'FIELD_SERVICE_MATERIAL_INVALID'; end if;
  return created_row;
end;
$$;

create or replace function public.add_field_service_note(target_company_id uuid, target_work_order_id uuid, target_body text)
returns public.field_service_work_order_notes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  created_row public.field_service_work_order_notes;
begin
  perform public.require_field_service_execution_access(target_company_id,target_work_order_id,array['planned','dispatched','in_progress']);
  if btrim(coalesce(target_body,'')) = '' or char_length(target_body) > 10000 then raise exception 'FIELD_SERVICE_NOTE_INVALID'; end if;
  insert into public.field_service_work_order_notes(company_id,work_order_id,body,created_by)
  values(target_company_id,target_work_order_id,btrim(target_body),auth.uid()) returning * into created_row;
  return created_row;
end;
$$;

create or replace function public.authorize_field_service_evidence_upload(target_company_id uuid, target_work_order_id uuid)
returns public.field_service_work_orders
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return public.require_field_service_execution_access(target_company_id,target_work_order_id,array['dispatched','in_progress']);
end;
$$;

create or replace function public.record_field_service_evidence(target_company_id uuid, target_work_order_id uuid, target_document_id uuid, target_evidence_type text)
returns public.field_service_work_order_evidence
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  created_row public.field_service_work_order_evidence;
begin
  perform public.require_field_service_execution_access(target_company_id,target_work_order_id,array['dispatched','in_progress']);
  if target_evidence_type not in ('photo','document','completion','other') then raise exception 'FIELD_SERVICE_EVIDENCE_INVALID'; end if;
  insert into public.field_service_work_order_evidence(company_id,work_order_id,document_id,evidence_type,uploaded_by)
  values(target_company_id,target_work_order_id,target_document_id,target_evidence_type,auth.uid()) returning * into created_row;
  return created_row;
end;
$$;

create or replace function public.record_field_service_signoff(
  target_company_id uuid,
  target_work_order_id uuid,
  target_customer_name text,
  target_confirmation_method text,
  target_signature_document_id uuid default null
)
returns public.field_service_work_order_signoffs
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  created_row public.field_service_work_order_signoffs;
begin
  perform public.require_field_service_execution_access(target_company_id,target_work_order_id,array['in_progress']);
  if btrim(coalesce(target_customer_name,'')) = '' or char_length(target_customer_name) > 240 then raise exception 'FIELD_SERVICE_SIGNOFF_INVALID'; end if;
  if target_confirmation_method not in ('verbal','checkbox','signature_document') then raise exception 'FIELD_SERVICE_SIGNOFF_INVALID'; end if;
  if target_confirmation_method = 'signature_document' and target_signature_document_id is null then raise exception 'FIELD_SERVICE_SIGNATURE_DOCUMENT_REQUIRED'; end if;
  if target_confirmation_method <> 'signature_document' and target_signature_document_id is not null then raise exception 'FIELD_SERVICE_SIGNOFF_INVALID'; end if;
  insert into public.field_service_work_order_signoffs(company_id,work_order_id,customer_name,confirmation_method,signature_document_id,recorded_by)
  values(target_company_id,target_work_order_id,btrim(target_customer_name),target_confirmation_method,target_signature_document_id,auth.uid()) returning * into created_row;
  return created_row;
exception when unique_violation then raise exception 'FIELD_SERVICE_SIGNOFF_EXISTS';
end;
$$;

-- Direct Data API mutations are intentionally unavailable; controlled RPCs are the only writes.
alter table public.field_service_work_order_materials enable row level security;
alter table public.field_service_work_order_notes enable row level security;
alter table public.field_service_work_order_evidence enable row level security;
alter table public.field_service_work_order_signoffs enable row level security;

revoke all on table public.field_service_work_order_materials, public.field_service_work_order_notes, public.field_service_work_order_evidence, public.field_service_work_order_signoffs from public, anon, authenticated, service_role;
grant select on table public.field_service_work_order_materials, public.field_service_work_order_notes, public.field_service_work_order_evidence, public.field_service_work_order_signoffs to authenticated;

create policy "field service authorized members read materials"
on public.field_service_work_order_materials for select to authenticated
using (
  (select public.resolve_company_module_access(company_id,'field_service') = 'MODULE_AVAILABLE')
  and (
    (select public.has_company_role(company_id,array['owner','employee']::public.company_role[]))
    or ((select public.has_company_role(company_id,array['technician']::public.company_role[]))
      and exists(select 1 from public.field_service_work_orders wo where wo.id=work_order_id and wo.assigned_user_id=auth.uid()))
  )
);
create policy "field service authorized members read notes"
on public.field_service_work_order_notes for select to authenticated
using (
  (select public.resolve_company_module_access(company_id,'field_service') = 'MODULE_AVAILABLE')
  and (
    (select public.has_company_role(company_id,array['owner','employee']::public.company_role[]))
    or ((select public.has_company_role(company_id,array['technician']::public.company_role[]))
      and exists(select 1 from public.field_service_work_orders wo where wo.id=work_order_id and wo.assigned_user_id=auth.uid()))
  )
);
create policy "field service authorized members read evidence"
on public.field_service_work_order_evidence for select to authenticated
using (
  (select public.resolve_company_module_access(company_id,'field_service') = 'MODULE_AVAILABLE')
  and (
    (select public.has_company_role(company_id,array['owner','employee']::public.company_role[]))
    or ((select public.has_company_role(company_id,array['technician']::public.company_role[]))
      and exists(select 1 from public.field_service_work_orders wo where wo.id=work_order_id and wo.assigned_user_id=auth.uid()))
  )
);
create policy "field service authorized members read signoffs"
on public.field_service_work_order_signoffs for select to authenticated
using (
  (select public.resolve_company_module_access(company_id,'field_service') = 'MODULE_AVAILABLE')
  and (
    (select public.has_company_role(company_id,array['owner','employee']::public.company_role[]))
    or ((select public.has_company_role(company_id,array['technician']::public.company_role[]))
      and exists(select 1 from public.field_service_work_orders wo where wo.id=work_order_id and wo.assigned_user_id=auth.uid()))
  )
);

revoke all on function public.require_field_service_execution_access(uuid,uuid,text[]) from public, anon, authenticated, service_role;
revoke all on function public.validate_field_service_execution_links() from public, anon, authenticated, service_role;
revoke all on function public.prevent_field_service_execution_mutation() from public, anon, authenticated, service_role;
revoke all on function public.audit_field_service_execution_change() from public, anon, authenticated, service_role;
revoke all on function public.add_field_service_material(uuid,uuid,text,uuid,text,text,numeric,text) from public, anon, authenticated, service_role;
revoke all on function public.add_field_service_note(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.authorize_field_service_evidence_upload(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_field_service_evidence(uuid,uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.record_field_service_signoff(uuid,uuid,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.add_field_service_material(uuid,uuid,text,uuid,text,text,numeric,text) to authenticated;
grant execute on function public.add_field_service_note(uuid,uuid,text) to authenticated;
grant execute on function public.authorize_field_service_evidence_upload(uuid,uuid) to authenticated;
grant execute on function public.record_field_service_evidence(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.record_field_service_signoff(uuid,uuid,text,text,uuid) to authenticated;
