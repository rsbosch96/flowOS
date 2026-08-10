-- AI FlowOS: PostgreSQL / Supabase schema, migration 001
-- Run with the Supabase migration runner as a database owner.

create extension if not exists pgcrypto;

create type public.company_role as enum ('owner', 'employee', 'technician');
create type public.document_status as enum ('uploaded', 'processing', 'ready', 'failed', 'deleted');
create type public.quote_status as enum ('draft', 'review', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'cancelled');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.ai_run_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'unpaid', 'incomplete', 'paused');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  locale text not null default 'nl-NL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  kvk_number text,
  vat_number text,
  address jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_memberships (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.company_role not null default 'employee',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_memberships_user_id_idx on public.company_memberships(user_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  address jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_company_id_idx on public.customers(company_id);
create index customers_company_name_idx on public.customers(company_id, name);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  uploaded_by uuid references public.users(id) on delete set null,
  storage_bucket text not null default 'company-documents',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum_sha256 text,
  status public.document_status not null default 'uploaded',
  classification text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_company_id_idx on public.documents(company_id);
create index documents_customer_id_idx on public.documents(customer_id);

create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  extractor text not null,
  schema_version text not null,
  extracted_data jsonb not null,
  confidence numeric(5,4) check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);
create index document_extractions_company_id_idx on public.document_extractions(company_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  quote_number text not null,
  title text not null,
  status public.quote_status not null default 'draft',
  currency char(3) not null default 'EUR',
  valid_until date,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  notes text,
  source_document_id uuid references public.documents(id) on delete set null,
  pdf_document_id uuid references public.documents(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, quote_number),
  check ((status <> 'approved') or approved_at is not null),
  check (total_cents = subtotal_cents + tax_cents)
);
create index quotes_company_status_idx on public.quotes(company_id, status);
create index quotes_customer_id_idx on public.quotes(customer_id);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  position integer not null check (position > 0),
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null default 'stuk',
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  vat_rate numeric(5,2) not null default 21 check (vat_rate between 0 and 100),
  line_total_cents bigint not null check (line_total_cents >= 0),
  unique (quote_id, position)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null check (channel in ('web', 'email', 'whatsapp', 'phone', 'internal')),
  subject text,
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'archived')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_company_status_idx on public.conversations(company_id, status);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  author_user_id uuid references public.users(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index conversation_messages_conversation_idx on public.conversation_messages(conversation_id, created_at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  title text not null,
  description text,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  assignee_id uuid references public.users(id) on delete set null,
  due_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_company_status_due_idx on public.tasks(company_id, status, due_at);
create index tasks_assignee_status_idx on public.tasks(assignee_id, status);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status public.subscription_status not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  seats integer not null default 1 check (seats > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  initiated_by uuid references public.users(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  kind text not null check (kind in ('document_extraction', 'quote_generation', 'reply_draft')),
  status public.ai_run_status not null default 'queued',
  model text,
  prompt_version text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  estimated_cost_cents integer check (estimated_cost_cents >= 0),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index ai_runs_company_created_idx on public.ai_runs(company_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id uuid,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_logs_company_occurred_idx on public.audit_logs(company_id, occurred_at desc);

-- Safe helpers: SECURITY DEFINER avoids RLS recursion in membership checks.
create or replace function public.is_company_member(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_memberships cm
    where cm.company_id = target_company_id and cm.user_id = auth.uid()
  );
$$;

create or replace function public.has_company_role(target_company_id uuid, allowed_roles public.company_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_memberships cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.has_company_role(uuid, public.company_role[]) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid, public.company_role[]) to authenticated;

-- RLS: all tenant-owned tables explicitly enabled. Service role bypasses RLS only in trusted backend code.
alter table public.users enable row level security;
create policy "users read own profile" on public.users for select to authenticated using (id = auth.uid());
create policy "users update own profile" on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.companies enable row level security;
create policy "members read companies" on public.companies for select to authenticated using (public.is_company_member(id));
create policy "owners update companies" on public.companies for update to authenticated using (public.has_company_role(id, array['owner']::public.company_role[])) with check (public.has_company_role(id, array['owner']::public.company_role[]));

alter table public.company_memberships enable row level security;
create policy "members read memberships" on public.company_memberships for select to authenticated using (public.is_company_member(company_id));
create policy "owners manage memberships" on public.company_memberships for all to authenticated using (public.has_company_role(company_id, array['owner']::public.company_role[])) with check (public.has_company_role(company_id, array['owner']::public.company_role[]));

-- Apply one tenant policy per table. Technician-specific assignment restrictions are application policies,
-- supplemented with RPCs where direct mutations must be allowed.
create policy "tenant customers" on public.customers for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
alter table public.customers enable row level security;
create policy "tenant documents" on public.documents for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
alter table public.documents enable row level security;
create policy "tenant extractions" on public.document_extractions for select to authenticated using (public.is_company_member(company_id));
alter table public.document_extractions enable row level security;
create policy "tenant quotes" on public.quotes for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
alter table public.quotes enable row level security;
create policy "tenant quote items" on public.quote_items for all to authenticated using (exists (select 1 from public.quotes q where q.id = quote_id and public.is_company_member(q.company_id))) with check (exists (select 1 from public.quotes q where q.id = quote_id and public.is_company_member(q.company_id)));
alter table public.quote_items enable row level security;
create policy "tenant conversations" on public.conversations for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
alter table public.conversations enable row level security;
create policy "tenant messages" on public.conversation_messages for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
alter table public.conversation_messages enable row level security;
create policy "tenant tasks" on public.tasks for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
alter table public.tasks enable row level security;
create policy "owners read subscription" on public.subscriptions for select to authenticated using (public.has_company_role(company_id, array['owner']::public.company_role[]));
alter table public.subscriptions enable row level security;
create policy "tenant ai runs read" on public.ai_runs for select to authenticated using (public.is_company_member(company_id));
create policy "tenant ai runs insert" on public.ai_runs for insert to authenticated with check (public.is_company_member(company_id));
create policy "tenant ai runs update" on public.ai_runs for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
alter table public.ai_runs enable row level security;
create policy "owners read audit logs" on public.audit_logs for select to authenticated using (public.has_company_role(company_id, array['owner']::public.company_role[]));
create policy "members insert audit logs" on public.audit_logs for insert to authenticated with check (company_id is not null and public.is_company_member(company_id));
alter table public.audit_logs enable row level security;

-- Storage policy example. Every path is '<company_uuid>/<document_uuid>/<filename>'.
create policy "members access own company objects" on storage.objects for select to authenticated
using (bucket_id = 'company-documents' and public.is_company_member((storage.foldername(name))[1]::uuid));
create policy "members upload own company objects" on storage.objects for insert to authenticated
with check (bucket_id = 'company-documents' and public.is_company_member((storage.foldername(name))[1]::uuid));

-- Recommended: enforce `updated_at` with a shared trigger in a subsequent migration,
-- and create profiles/membership through an authenticated server-side onboarding function.
