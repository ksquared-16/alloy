-- Backfill semantic pipeline stage keys used by book-v2
-- Safe to re-run

update public.pipeline_stages
set key = 'quote_started'
where org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
  and lower(name) = 'quote started'
  and (key is null or key <> 'quote_started');

update public.pipeline_stages
set key = 'booked'
where org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
  and lower(name) = 'booked'
  and (key is null or key <> 'booked');