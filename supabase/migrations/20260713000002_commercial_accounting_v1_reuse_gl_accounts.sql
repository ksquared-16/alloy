-- =============================================================================
-- Accounting V1 correction — reuse existing gl_accounts, drop duplicate
-- =============================================================================
-- Audit finding: a full GL primitive already exists (gl_accounts + gl_account_mappings
-- + gl_journal_* + ledger_transactions), with a live API (/api/admin/financials/accounts),
-- service layer (lib/financials/gl/glConfigService), and Accounting UI. The
-- commercial_gl_accounts table introduced in 20260713000001 DUPLICATED gl_accounts.
--
-- This migration corrects that: Revenue Category → GL Account now references the
-- canonical gl_accounts chart of accounts directly (Option A).
--
-- Preserved (non-duplicating, still correct):
--   - commercial_revenue_categories
--   - commercial_products.revenue_category_id      (FK → commercial_revenue_categories)
--   - commercial_tuition_rates.revenue_category_id (FK → commercial_revenue_categories)
--
-- Non-destructive to the shared ledger. Only removes the duplicate commercial table.
-- =============================================================================

set search_path to public;

-- 1. Drop the FK from mapped_gl_account_id → commercial_gl_accounts (the duplicate).
alter table public.commercial_revenue_categories
  drop constraint if exists commercial_revenue_categories_mapped_gl_account_id_fkey;

-- 2. Repoint mapped_gl_account_id at the canonical chart of accounts (gl_accounts).
--    Column already exists; only the referenced table changes. Any values pointing
--    at the (empty) duplicate are cleared first for referential safety.
update public.commercial_revenue_categories
  set mapped_gl_account_id = null
  where mapped_gl_account_id is not null
    and mapped_gl_account_id not in (select id from public.gl_accounts);

alter table public.commercial_revenue_categories
  add constraint commercial_revenue_categories_mapped_gl_account_id_fkey
  foreign key (mapped_gl_account_id) references public.gl_accounts(id) on delete set null;

comment on column public.commercial_revenue_categories.mapped_gl_account_id is
  'Accounting mapping (V1): which existing gl_accounts row this revenue category posts to. Direct FK to the canonical chart of accounts. V2 may bridge to gl_account_mappings for the posting resolver.';

-- 3. Drop the duplicate table.
drop table if exists public.commercial_gl_accounts;
