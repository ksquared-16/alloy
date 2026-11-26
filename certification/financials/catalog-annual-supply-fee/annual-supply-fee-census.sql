-- Why is "Annual Supply Fee" not offered by Add Charge? Configuration only — no customer data.
-- One row per Catalog item named like "supply fee": frequency, type, active/effective, scope,
-- price, and every link of its posting chain (revenue category -> GL account -> posting mappings).
-- Output contract: question_id | kind | payload(json).
select
  'asf' || row_number() over (order by p.org_id, p.name, p.id) as question_id,
  'row' as kind,
  json_build_object(
    'org_name', o.name,
    'org_id', p.org_id,
    'product_id', p.id,
    'name', p.name,
    'commercial_type', p.commercial_type,
    'cadence_key', p.cadence_key,
    'amount_cents', p.amount_cents,
    'is_active', p.is_active,
    'effective_start', p.effective_start,
    'effective_end', p.effective_end,
    'location_id', p.location_id,
    'program_key', p.program_key,
    'behavior', p.behavior,
    'legacy_revenue_category_text', p.revenue_category,
    'revenue_category_id', p.revenue_category_id,
    'revenue_category_label', rc.label,
    'revenue_category_active', rc.is_active,
    'revenue_category_gl_account_id', rc.mapped_gl_account_id,
    'gl_account_code', ga.code,
    'gl_account_name', ga.name,
    'gl_account_type', ga.type,
    'gl_account_active', ga.is_active,
    'own_mapping_key_active', exists (
      select 1 from public.gl_account_mappings m
      where m.org_id = p.org_id and m.key = 'catalog_gl_account:' || ga.id::text
        and m.gl_account_id = ga.id and m.is_active is not false),
    'active_mapping_keys_to_account', (
      select coalesce(json_agg(m.key order by m.key), '[]'::json) from public.gl_account_mappings m
      where m.org_id = p.org_id and m.gl_account_id = ga.id and m.is_active is not false),
    'org_one_time_items_active', (
      select count(*) from public.commercial_products q
      where q.org_id = p.org_id and q.is_active and coalesce(q.cadence_key, '') in ('', 'one_time')),
    'measured_at', now()
  )::text as payload
from public.commercial_products p
left join public.orgs o on o.id = p.org_id
left join public.commercial_revenue_categories rc on rc.id = p.revenue_category_id
left join public.gl_accounts ga on ga.id = rc.mapped_gl_account_id
where p.name ilike '%supply%fee%';
