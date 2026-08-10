-- WP13.4: a document can only reference a customer from the same company.
-- Abort on legacy drift; do not rewrite or delete existing records.
do $$
begin
  if exists (
    select 1
    from public.documents document
    left join public.customers customer on customer.id = document.customer_id
    where document.customer_id is not null
      and customer.id is null
  ) then
    raise exception 'DOCUMENT_CUSTOMER_INTEGRITY_ORPHANS_FOUND';
  end if;

  if exists (
    select 1
    from public.documents document
    join public.customers customer on customer.id = document.customer_id
    where document.company_id is distinct from customer.company_id
  ) then
    raise exception 'DOCUMENT_CUSTOMER_TENANT_MISMATCHES_FOUND';
  end if;
end;
$$;

-- Required as the referenced key for the composite tenant foreign key.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_id_company_id_key'
  ) then
    alter table public.customers
      add constraint customers_id_company_id_key unique (id, company_id);
  end if;
end;
$$;

-- The legacy FK checks only customer existence. Replace it with the composite
-- relation while preserving nullable customer_id and the existing SET NULL
-- behaviour when a customer is deleted. No CASCADE is used.
alter table public.documents
  drop constraint if exists documents_customer_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_customer_company_id_fkey'
  ) then
    alter table public.documents
      add constraint documents_customer_company_id_fkey
      foreign key (customer_id, company_id)
      references public.customers (id, company_id)
      on update no action
      on delete set null (customer_id);
  end if;
end;
$$;

create index if not exists documents_customer_company_idx
  on public.documents (customer_id, company_id);

comment on constraint documents_customer_company_id_fkey on public.documents is
  'Enforces that an optional document customer belongs to the document company. ON DELETE SET NULL (customer_id) preserves the previous customer deletion behaviour; ON UPDATE NO ACTION prevents reassignment.';
