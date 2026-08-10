-- RSTECH-WP4: tenant-private product image reference. Existing catalog rows
-- remain valid and images live in the existing company-documents bucket.
alter table public.product_catalog_items
  add column if not exists image_storage_path text;
