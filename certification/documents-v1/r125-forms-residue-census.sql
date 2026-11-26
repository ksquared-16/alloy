-- Documents fix-forward (PR #1612) — SUPPLEMENTARY Forms / subject residue census for hosted QA run qar_8fb0e1ffabcf.
-- Independent of the registered authz_q1 census (eb702fb6…), which measures no Forms table. Read-only, one statement.
--   ZERO: this run's leads, households and children (by id), this run's form submissions (by id), submissions,
--         public links and submission documents of this run's forms (key qa_8fb0e1ffabcf_%), active health facts on
--         a child that no longer exists (QA Shared).
--   DATA (retained by design): this run's form definitions (published forms are archived, never deleted), ended
--         health facts on deleted children (append-only, ended is the product's only disposal), and, for the record,
--         the earlier run qar_4246ac22ece0's child-only submissions orphaned before the R5 repair.
select question_id, kind, payload
from (
    select 'r125_zr_subjects'::text as question_id, 'check'::text as kind,
           'opportunities_customers_customer_members ~ run_fixture_ids ~ zero ~ '
           || coalesce(((select count(*) from public.opportunities where id = any(array['3b3bf5d8-1ab8-4bee-9579-f4df4de0bf69'::uuid, '4422e726-8669-4f31-91cc-e4907eac9a15'::uuid, 'b8e4eaf6-93b7-4883-bddb-98eb1e91cf20'::uuid, 'ca129a37-f036-43d3-90fd-d1c71e392012'::uuid, 'd18524e6-0706-4d78-a601-c4ca08e9777c'::uuid, 'e6c2b31a-fcd4-43c3-bd41-8604c733e0a0'::uuid]))
                      + (select count(*) from public.customers where id = any(array['1e692a12-d48e-4b22-8956-43f5f442e327'::uuid, '60c6d05e-e8a3-41b7-bc6a-9013bbbf7c42'::uuid, '7b99481b-df65-4d00-99e4-455715903105'::uuid, '906cfc85-97de-4524-bdbe-e4b1682f7a84'::uuid, 'c2be4c73-f700-41b9-baad-9aa495de44c6'::uuid, 'e7bf6e73-64cf-4d6a-99a3-3135156f0ae0'::uuid]))
                      + (select count(*) from public.customer_members where id = any(array['30db3f14-e81b-49db-af78-5dcd9995b02d'::uuid, '3e39892b-e386-470e-91fc-25387b0818b8'::uuid, '57178564-b0da-4148-ba04-6e40e2499a49'::uuid, '5b628083-98b5-403c-80e3-e426be79ca9e'::uuid, '7e6af359-b9b8-4aea-9091-60d67a9b4602'::uuid, '8df8f710-8bb4-466f-a954-cd4d022726de'::uuid, 'c214e8ed-b6df-4bb1-b40c-1a0031365811'::uuid, 'd1cd7d61-b4b3-486b-8cd2-fbf914c82d3d'::uuid, 'db512e93-f377-483c-9720-dfc6b8006745'::uuid, 'ea3639cc-d0e7-4529-a7f4-86e0a3089643'::uuid])) = 0)::text, 'false') as payload,
           '01'::text as sort_key
    union all
    select 'r125_zr_submissions_by_id', 'check',
           'form_submissions ~ run_submission_ids ~ zero ~ '
           || coalesce(((select count(*) from public.form_submissions where id = any(array['1599490c-8975-47b0-8418-0b0868c7b319'::uuid, '189e0b4d-12bd-4ed0-bbd1-23c8b490ad8f'::uuid, '3ea71149-9a82-41d9-a295-e6ed21175fc6'::uuid, '715ade06-0cbb-45dc-8a8a-3df8d2b5a334'::uuid, '9a0b1eec-391d-42c4-9c64-b58fd7b78a56'::uuid, 'bf3bc522-1281-4785-8f03-f8acd52bb76c'::uuid, 'c233fddd-7e57-4205-9506-64093db41561'::uuid, 'd51ca956-c1dd-45d6-a770-99f3c6b6ecf0'::uuid])) = 0)::text, 'false'),
           '02'
    union all
    select 'r125_zr_submissions_of_run_forms', 'check',
           'form_submissions ~ run_forms ~ zero ~ '
           || coalesce(((select count(*) from public.form_submissions s join public.form_definitions f on f.id = s.form_definition_id
                         where f.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and f.key like 'qa\_8fb0e1ffabcf\_%') = 0)::text, 'false'),
           '03'
    union all
    select 'r125_zr_links_of_run_forms', 'check',
           'form_public_links ~ run_forms ~ zero ~ '
           || coalesce(((select count(*) from public.form_public_links l join public.form_definitions f on f.id = l.form_definition_id
                         where f.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and f.key like 'qa\_8fb0e1ffabcf\_%') = 0)::text, 'false'),
           '04'
    union all
    select 'r125_zr_submission_documents', 'check',
           'form_submission_documents ~ run_submission_ids ~ zero ~ '
           || coalesce(((select count(*) from public.form_submission_documents where form_submission_id = any(array['1599490c-8975-47b0-8418-0b0868c7b319'::uuid, '189e0b4d-12bd-4ed0-bbd1-23c8b490ad8f'::uuid, '3ea71149-9a82-41d9-a295-e6ed21175fc6'::uuid, '715ade06-0cbb-45dc-8a8a-3df8d2b5a334'::uuid, '9a0b1eec-391d-42c4-9c64-b58fd7b78a56'::uuid, 'bf3bc522-1281-4785-8f03-f8acd52bb76c'::uuid, 'c233fddd-7e57-4205-9506-64093db41561'::uuid, 'd51ca956-c1dd-45d6-a770-99f3c6b6ecf0'::uuid])) = 0)::text, 'false'),
           '05'
    union all
    select 'r125_zr_active_facts_on_deleted_children', 'check',
           'person_health_facts ~ active_on_missing_child_qa_shared ~ zero ~ '
           || coalesce(((select count(*) from public.person_health_facts h
                         where h.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and h.status = 'active' and h.subject_entity_type in ('customer_member', 'child')
                           and not exists (select 1 from public.customer_members m where m.id = h.subject_entity_id)) = 0)::text, 'false'),
           '06'
    union all
    select 'r125_data_retained', 'data',
           json_build_object(
               'run_form_definitions', (select count(*) from public.form_definitions f where f.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and f.key like 'qa\_8fb0e1ffabcf\_%'),
               'run_form_definitions_active', (select count(*) from public.form_definitions f where f.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and f.key like 'qa\_8fb0e1ffabcf\_%' and f.is_active),
               'ended_facts_on_missing_children_run', (select count(*) from public.person_health_facts h
                    where h.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and h.status <> 'active' and h.subject_entity_id = any(array['30db3f14-e81b-49db-af78-5dcd9995b02d'::uuid, '3e39892b-e386-470e-91fc-25387b0818b8'::uuid, '57178564-b0da-4148-ba04-6e40e2499a49'::uuid, '5b628083-98b5-403c-80e3-e426be79ca9e'::uuid, '7e6af359-b9b8-4aea-9091-60d67a9b4602'::uuid, '8df8f710-8bb4-466f-a954-cd4d022726de'::uuid, 'c214e8ed-b6df-4bb1-b40c-1a0031365811'::uuid, 'd1cd7d61-b4b3-486b-8cd2-fbf914c82d3d'::uuid, 'db512e93-f377-483c-9720-dfc6b8006745'::uuid, 'ea3639cc-d0e7-4529-a7f4-86e0a3089643'::uuid])),
               'qar_4246_form_definitions', (select count(*) from public.form_definitions f where f.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and f.key like 'qa\_4246ac22ece0\_%'),
               'qar_4246_submissions_of_its_forms', (select count(*) from public.form_submissions s join public.form_definitions f on f.id = s.form_definition_id
                    where f.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and f.key like 'qa\_4246ac22ece0\_%')
           )::text,
           '07'
) q
order by sort_key;
