-- CONCEPT ONLY — review by CTO/Claude before this migration is applied.
-- Provisions private, tenant-isolated Storage for existing documents and future product images.

do $$
declare
  existing_bucket storage.buckets%rowtype;
  expected_document_mime_types text[] := array['application/pdf', 'image/jpeg', 'image/png', 'text/plain']::text[];
  expected_image_mime_types text[] := array['image/jpeg', 'image/png']::text[];
begin
  select * into existing_bucket from storage.buckets where id = 'company-documents';
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('company-documents', 'company-documents', false, 26214400, expected_document_mime_types);
  elsif existing_bucket.public is distinct from false
    or existing_bucket.file_size_limit is distinct from 26214400
    or cardinality(existing_bucket.allowed_mime_types) is distinct from cardinality(expected_document_mime_types)
    or not (existing_bucket.allowed_mime_types @> expected_document_mime_types and expected_document_mime_types @> existing_bucket.allowed_mime_types) then
    raise exception 'Storage bucket company-documents exists with an unexpected security configuration';
  end if;

  select * into existing_bucket from storage.buckets where id = 'company-images';
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('company-images', 'company-images', false, 5242880, expected_image_mime_types);
  elsif existing_bucket.public is distinct from false
    or existing_bucket.file_size_limit is distinct from 5242880
    or cardinality(existing_bucket.allowed_mime_types) is distinct from cardinality(expected_image_mime_types)
    or not (existing_bucket.allowed_mime_types @> expected_image_mime_types and expected_image_mime_types @> existing_bucket.allowed_mime_types) then
    raise exception 'Storage bucket company-images exists with an unexpected security configuration';
  end if;
end;
$$;

-- The CASE expression avoids a UUID cast failure for malformed client paths.
-- Every policy also requires a membership row for auth.uid() in the company from path segment one.
drop policy if exists "members access own company objects" on storage.objects;
drop policy if exists "members upload own company objects" on storage.objects;
drop policy if exists "company documents members upload" on storage.objects;
drop policy if exists "company documents catalog read" on storage.objects;
drop policy if exists "company documents catalog delete" on storage.objects;
drop policy if exists "company images members read" on storage.objects;
drop policy if exists "company images members upload" on storage.objects;
drop policy if exists "company images members delete" on storage.objects;

-- Existing document signed uploads: members may insert only inside their own tenant prefix.
create policy "company documents members upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-documents'
  and auth.uid() is not null
  and exists (
    select 1
    from public.company_memberships cm
    where cm.user_id = auth.uid()
      and cm.company_id = case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(name, '/', 1)::uuid
        else null
      end
  )
);

-- Temporary compatibility for current WP4 routes, which still store catalog images in company-documents.
create policy "company documents catalog read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'company-documents'
  and split_part(name, '/', 2) = 'catalog'
  and auth.uid() is not null
  and exists (
    select 1
    from public.company_memberships cm
    where cm.user_id = auth.uid()
      and cm.company_id = case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(name, '/', 1)::uuid
        else null
      end
  )
);

create policy "company documents catalog delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-documents'
  and split_part(name, '/', 2) = 'catalog'
  and auth.uid() is not null
  and exists (
    select 1
    from public.company_memberships cm
    where cm.user_id = auth.uid()
      and cm.company_id = case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(name, '/', 1)::uuid
        else null
      end
  )
);

-- Target policy set after WP4 routes switch their bucket constant to company-images.
create policy "company images members read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'company-images'
  and auth.uid() is not null
  and exists (
    select 1
    from public.company_memberships cm
    where cm.user_id = auth.uid()
      and cm.company_id = case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(name, '/', 1)::uuid
        else null
      end
  )
);

create policy "company images members upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-images'
  and auth.uid() is not null
  and exists (
    select 1
    from public.company_memberships cm
    where cm.user_id = auth.uid()
      and cm.company_id = case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(name, '/', 1)::uuid
        else null
      end
  )
);

create policy "company images members delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-images'
  and auth.uid() is not null
  and exists (
    select 1
    from public.company_memberships cm
    where cm.user_id = auth.uid()
      and cm.company_id = case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(name, '/', 1)::uuid
        else null
      end
  )
);

-- No UPDATE policy: current signed upload flows create a new immutable object,
-- and this blocks cross-tenant or in-tenant object moves/overwrites by clients.
