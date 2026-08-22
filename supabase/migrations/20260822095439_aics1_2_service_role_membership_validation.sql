-- AICS1.2: the tenant-link trigger reads only these membership columns
-- during controlled server-side knowledge writes. Keep client privileges
-- unchanged and avoid granting service_role unrelated table access.
grant select (company_id, user_id)
on table public.company_memberships
to service_role;
