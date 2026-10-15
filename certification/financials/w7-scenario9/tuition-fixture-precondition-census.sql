-- W7 Scenario 9 — what a W7 tuition fixture must fit into on the deployed primary. Read-only, one statement.
-- (1) The shape of the existing enrolled monthly assignment (Certhouse) — stage/status keys only.
-- (2) North Campus's program categories, offerings and monthly tuition rates (keys, labels, amounts).
-- (3) Whether the W7 id block for the tuition fixture is free.
with org as (select o.org_id as id from customers o where o.id = 'fd000000-0000-4000-8000-0000007c0001'::uuid),
north as (select l.id from locations l, org where l.org_id = org.id and l.location_type = 'site' and l.is_active and l.label = 'North Campus' order by l.id limit 1)
select 'assignment', 'row', json_build_object('label', 'certhouse_monthly_assignment',
  'ocm_stage', ocm.stage_key, 'ocm_outcome', ocm.outcome_status_key, 'ocm_schedule_type', ocm.schedule_type,
  'ocm_location_is_north', ocm.location_id = (select id from north), 'ocm_has_program', ocm.program_category_id is not null,
  'ocm_start', ocm.start_date, 'ocm_metadata_keys', (select json_agg(k) from jsonb_object_keys(coalesce(ocm.metadata,'{}'::jsonb)) k),
  'opp_stage', o.stage_key, 'opp_status', o.status_key, 'opp_has_work_unit', o.work_unit_id is not null, 'opp_source', o.source,
  'agreement_status', a.status, 'agreement_source', a.source_key, 'agreement_start', a.start_date)::text
  from opportunity_customer_members ocm join opportunities o on o.id = ocm.opportunity_id
  left join child_enrollment_agreements a on a.opportunity_customer_member_id = ocm.id
 where ocm.id = 'cf044308-3ee4-47ab-a8fb-205eb172aa48'::uuid
union all
select 'program', 'row', json_build_object('label', c.key, 'category_label', c.label, 'active', c.is_active, 'at_north', true,
  'offerings', (select json_agg(json_build_object('attendance', po.attendance_type, 'active', po.is_active, 'status', po.status,
       'variants', (select json_agg(json_build_object('qty_type', v.quantity_type, 'qty', v.quantity_value, 'active', v.is_active,
            'rates', (select json_agg(json_build_object('cadence', r.cadence_key, 'payer', r.payer_type, 'cents', r.rate_cents, 'loc', case when r.location_id is null then 'org_default' when r.location_id = (select id from north) then 'north' else 'other' end, 'active', r.is_active, 'start', r.effective_start, 'end', r.effective_end))
                       from commercial_tuition_rates r where r.variant_id = v.id)))
          from program_offering_variants v where v.offering_id = po.id)))
     from program_offerings po, org where po.org_id = org.id and po.program_key = c.key))::text
  from location_program_categories c, north where c.location_id = north.id
union all
select 'w7block', 'row', json_build_object('label', 'w7_tuition_ids_free',
  'customers', (select count(*) from customers where id::text like 'fd000000-0000-4000-8000-00000079%'),
  'categories_w7', (select count(*) from location_program_categories c, org where c.org_id = org.id and c.key like 'w7_%'),
  'offerings_w7', (select count(*) from program_offerings po, org where po.org_id = org.id and po.program_key like 'w7_%'))::text
