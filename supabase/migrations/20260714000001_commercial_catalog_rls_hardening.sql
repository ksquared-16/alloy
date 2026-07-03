-- =============================================================================
-- Commercial Platform V1 — RLS hardening for the Catalog tables
-- =============================================================================
-- Security audit finding: the newer Commercial catalog tables shipped WITHOUT
-- row-level security, while their siblings (commercial_tuition_rates,
-- program_offerings, program_offering_variants, gl_accounts) correctly enable
-- RLS with the standard org-scoped 5-policy set. With RLS off + broad table
-- grants, any authenticated user could read/write ANY org's rows via PostgREST.
--
-- This migration brings the 6 catalog tables up to the SAME doctrine — the
-- identical policy shape used across the platform (has_org_role org-scoping +
-- a service_role ALL policy for the admin API). No new policy style is introduced.
--
-- Classification (all six): OPERATOR-FACING CONFIG → RLS, org-scoped.
--   commercial_products, commercial_categories, commercial_revenue_categories
--     — actively operator-configured; the real gap.
--   commercial_fees, commercial_addons, commercial_deposits
--     — transitional/legacy but still hold org data; hardened for consistency
--       and defense-in-depth (they are no longer written by the UI).
--
-- The admin API uses the service_role client (bypasses RLS); the service_role
-- policy preserves that. Idempotent: drops policies if present before creating.
-- =============================================================================

set search_path to public;

do $$
declare
  t text;
  tables text[] := array[
    'commercial_products',
    'commercial_categories',
    'commercial_revenue_categories',
    'commercial_fees',
    'commercial_addons',
    'commercial_deposits'
  ];
begin
  foreach t in array tables loop
    -- Enable RLS
    execute format('alter table public.%I enable row level security;', t);

    -- Grants consistent with siblings (RLS is the gate; grants are broad).
    execute format('grant select, insert, update, delete on table public.%I to authenticated;', t);
    execute format('grant all on table public.%I to service_role;', t);

    -- SELECT — owner/admin/ops/manager
    execute format('drop policy if exists %I on public.%I;', t||'_select_org', t);
    execute format($p$create policy %I on public.%I
      for select to authenticated
      using (public.has_org_role(org_id, array['owner','admin','ops','manager']));$p$,
      t||'_select_org', t);

    -- INSERT — owner/admin/ops
    execute format('drop policy if exists %I on public.%I;', t||'_insert_org', t);
    execute format($p$create policy %I on public.%I
      for insert to authenticated
      with check (public.has_org_role(org_id, array['owner','admin','ops']));$p$,
      t||'_insert_org', t);

    -- UPDATE — owner/admin/ops
    execute format('drop policy if exists %I on public.%I;', t||'_update_org', t);
    execute format($p$create policy %I on public.%I
      for update to authenticated
      using (public.has_org_role(org_id, array['owner','admin','ops']))
      with check (public.has_org_role(org_id, array['owner','admin','ops']));$p$,
      t||'_update_org', t);

    -- DELETE — owner/admin
    execute format('drop policy if exists %I on public.%I;', t||'_delete_org', t);
    execute format($p$create policy %I on public.%I
      for delete to authenticated
      using (public.has_org_role(org_id, array['owner','admin']));$p$,
      t||'_delete_org', t);

    -- Service role — full access (admin API path)
    execute format('drop policy if exists %I on public.%I;', t||'_all_service_role', t);
    execute format($p$create policy %I on public.%I
      for all to service_role using (true) with check (true);$p$,
      t||'_all_service_role', t);
  end loop;
end $$;
