-- FlowOS Storage backup inventory. Read-only by design.
-- Run against the source and isolated restored database; protect output as encrypted backup metadata.
begin transaction read only;

select jsonb_build_object(
  'format', 'flowos-storage-inventory',
  'formatVersion', 1,
  'capturedAt', now(),
  'buckets', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', b.id,
      'isPrivate', not b.public,
      'fileSizeLimit', b.file_size_limit,
      'allowedMimeTypes', b.allowed_mime_types,
      'objectCount', coalesce(o.object_count, 0),
      'bytes', coalesce(o.bytes, 0),
      'invalidTenantPrefixCount', coalesce(o.invalid_tenant_prefix_count, 0),
      'objects', coalesce(o.objects, '[]'::jsonb)
    ) order by b.id)
    from storage.buckets b
    left join lateral (
      select
        count(*) as object_count,
        coalesce(sum(coalesce((so.metadata ->> 'size')::bigint, 0)), 0) as bytes,
        count(*) filter (where c.id is null) as invalid_tenant_prefix_count,
        coalesce(jsonb_agg(jsonb_build_object(
          'path', so.name,
          'bytes', coalesce((so.metadata ->> 'size')::bigint, 0),
          'tenantPrefixValid', c.id is not null,
          'storageEtag', so.metadata ->> 'eTag'
        ) order by so.name), '[]'::jsonb) as objects
      from storage.objects so
      left join public.companies c on c.id::text = split_part(so.name, '/', 1)
      where so.bucket_id = b.id
    ) o on true
    where b.id in ('company-documents', 'company-images')
  ), '[]'::jsonb)
) as storage_inventory;

commit;
