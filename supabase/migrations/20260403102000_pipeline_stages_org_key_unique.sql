-- Enforce unique semantic stage keys per org when key is populated

create unique index if not exists ux_pipeline_stages_org_key
on public.pipeline_stages (org_id, key)
where key is not null;