-- Documents authz_q1 — ZERO_RESIDUE census (B2 + Activation Safety, read-only).
-- After qa_run_close + fixture reset:
--   ZERO: alloy_qa_fixture / aa000000- vendors in QA orgs; qa_* custom role grants;
--         non-actor memberships in either QA org; provider-sent communication_messages.
--   RETAINED BY DESIGN: access audit history (mutation_events) — reported as data, never as residue.
-- Persistent orgs/users/actors are retained.
select question_id, kind, payload
from (
    select 'doc_zr_00'::text as question_id, 'data'::text as kind,
           json_build_object(
               'qa_shared', '4acc9386-c485-486f-aa1f-05d83499d142',
               'qa_secondary', 'ad53fee2-2570-460f-9300-f0e106c473b6',
               'cleanup', 'zero_residue',
               'retained_by_design', array[
                 'access audit history (mutation_events) written by the audited functions'
               ]
           )::text as payload,
           '00'::text as sort_key
    union all
    select 'doc_zr_vendors', 'check',
           'vendors ~ alloy_qa_fixture ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.vendors v
                where v.org_id in (
                        '4acc9386-c485-486f-aa1f-05d83499d142'::uuid,
                        'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                      )
                  and (
                    v.external_source = 'alloy_qa_fixture'
                    or v.id::text like 'aa000000-%'
                  )
              ), 'false'),
           '01'
    union all
    select 'doc_zr_qa_role_grants', 'check',
           'role_permission_grants ~ qa_custom_roles ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.role_permission_grants g
                where g.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                  and g.role_key like 'qa_%'
                  and g.allowed = true
              ), 'true'),
           '02'
    union all
    -- Pool-access equivalent: exclude only each org's frozen provisioning administrator.
    select 'doc_zr_pool_access', 'check',
           'user_roles ~ qa_orgs_non_actor ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.user_roles ur
                where ur.org_id in (
                        '4acc9386-c485-486f-aa1f-05d83499d142'::uuid,
                        'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                      )
                  and not (
                    (
                      ur.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                      and exists (
                        select 1 from auth.users u
                        where u.id = ur.user_id
                          and lower(u.email) = lower('qa-shared-actor@example.com')
                      )
                    )
                    or (
                      ur.org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                      and exists (
                        select 1 from auth.users u
                        where u.id = ur.user_id
                          and lower(u.email) = lower('qa-secondary-admin@example.com')
                      )
                    )
                  )
              ), 'false'),
           '03'
    union all
    select 'doc_zr_zero_sent', 'check',
           'communication_messages ~ status_sent ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.communication_messages cm
                where cm.org_id in (
                        '4acc9386-c485-486f-aa1f-05d83499d142'::uuid,
                        'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
                      )
                  and cm.status = 'sent'
              ), 'false'),
           '04'
    union all
    select 'doc_zr_retained_audit', 'data',
           json_build_object(
               'artifact', 'access audit history (mutation_events)',
               'status', 'retained_by_design',
               'not_residue', true,
               'qa_shared_mutation_event_rows', coalesce((
                 select count(*)::int
                 from public.mutation_events me
                 where me.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
               ), 0)
           )::text,
           '05'
) q
order by sort_key;
