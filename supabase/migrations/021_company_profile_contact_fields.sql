-- RSTECH-SPRINT-009 / DOG-016: additive contact fields for the company profile.
alter table public.companies
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists website text;
