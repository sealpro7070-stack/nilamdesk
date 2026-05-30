-- Migration: admin_credit_grants audit table
-- Records every manual credit grant an admin makes from the admin panel.
-- Kept separate from credit_grants (which is tied to plan grants) so the
-- plan-grant ledger stays clean and grant history is independently queryable.
--
-- Run this in the Supabase SQL editor.

create table if not exists public.admin_credit_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  amount      integer not null,            -- credits granted (may be negative to deduct)
  note        text,                        -- admin's reason for the grant
  granted_by  text not null,               -- admin email that performed the grant
  created_at  timestamptz not null default now()
);

create index if not exists admin_credit_grants_user_id_idx
  on public.admin_credit_grants (user_id);

create index if not exists admin_credit_grants_created_at_idx
  on public.admin_credit_grants (created_at desc);

-- RLS on with NO policies: only the service-role backend can read/write.
alter table public.admin_credit_grants enable row level security;
