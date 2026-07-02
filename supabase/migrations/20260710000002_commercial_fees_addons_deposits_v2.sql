set search_path to public;

-- Drop hardcoded check constraints — types become free-text operator labels
alter table commercial_fees drop constraint if exists commercial_fees_fee_type_check;
alter table commercial_addons drop constraint if exists commercial_addons_addon_type_check;
alter table commercial_deposits drop constraint if exists commercial_deposits_due_timing_check;

-- Add effective dates to all three tables
alter table commercial_fees
  add column if not exists effective_start date,
  add column if not exists effective_end date,
  add column if not exists revenue_category text;

alter table commercial_addons
  add column if not exists effective_start date,
  add column if not exists effective_end date,
  add column if not exists revenue_category text,
  add column if not exists package_unit_count integer check (package_unit_count is null or package_unit_count > 0),
  add column if not exists package_unit_type text,
  add column if not exists package_expires_days integer check (package_expires_days is null or package_expires_days > 0);

alter table commercial_deposits
  add column if not exists effective_start date,
  add column if not exists effective_end date,
  add column if not exists revenue_category text;
