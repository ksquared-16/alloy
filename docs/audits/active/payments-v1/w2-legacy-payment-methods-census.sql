-- Payments V1 · W2 — legacy retirement census. ONE STATEMENT, read only.
--
-- Decides one question before anything destructive: does `customer_payment_methods` hold rows that
-- matter, or only development-era residue? The table's ONLY writer, persistBookingPaymentMethod,
-- has zero callers in the current base, so the product cannot have written to it recently. This
-- asks the deployed database whether that is visible in the data.
--
-- Emitted as question_id | kind | payload so each answer is separable.
select 'cpm_total' as question_id, 'scalar' as kind, count(*)::text as payload
from public.customer_payment_methods
union all
select 'cpm_age', 'row',
       coalesce(min(created_at)::text, 'none') || ' .. ' || coalesce(max(created_at)::text, 'none')
from public.customer_payment_methods
union all
select 'cpm_by_org', 'table', c.org_id::text || ' rows=' || count(*)::text
from public.customer_payment_methods pm
join public.customers c on c.id = pm.customer_id
group by c.org_id
order by 1, 3;
