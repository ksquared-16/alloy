-- Business Processes bp_v2 — QUIESCED_RETAINED census (B2 + Activation Safety, read-only).
-- Access must be clean: only the frozen provisioning administrator may retain membership.
-- Posted financial rows, published process configuration, and access audit history are
-- RETAINED BY DESIGN and reported as data — never asserted to zero.
-- Activation Safety also asserts zero provider-sent communication_messages.
select question_id, kind, payload
from (
    select 'bp_qr_00'::text as question_id, 'data'::text as kind,
           json_build_object(
               'qa_shared', '4acc9386-c485-486f-aa1f-05d83499d142',
               'cleanup', 'quiesced_retained',
               'retained_by_design', array[
                 'posted financial records (immutable), neutralized and attributed by run',
                 'published process configuration',
                 'access audit history (mutation_events)'
               ]
           )::text as payload,
           '00'::text as sort_key
    union all
    -- EFFECTIVE persona access, not only memberships: a role, an access profile, or the site and
    -- department scope rows hung on a profile. A removed role that leaves its profile behind is residue
    -- (re-granting any role re-activates that scope). Excludes ONLY the frozen provisioning
    -- administrator (by email), not every admin role.
    select 'bp_qr_pool_access', 'check',
           'user_roles+user_access_profiles+user_site_access+user_department_access ~ qa_shared_non_actor ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from (
                    select ur.user_id from public.user_roles ur where ur.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all
                    select ap.user_id from public.user_access_profiles ap where ap.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all
                    select sa.user_id from public.user_site_access sa where sa.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all
                    select da.user_id from public.user_department_access da where da.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                ) access
                where not exists (
                    select 1
                    from auth.users u
                    where u.id = access.user_id
                      and lower(u.email) = lower('qa-shared-actor@example.com')
                  )
              ), 'false'),
           '01'
    union all
    select 'bp_qr_zero_sent', 'check',
           'communication_messages ~ status_sent ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.communication_messages cm
                where cm.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                  and cm.status = 'sent'
              ), 'false'),
           '02'
    union all
    select 'bp_qr_org_present', 'data',
           json_build_object(
               'qa_shared_present', (select exists(select 1 from public.orgs where id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid))
           )::text,
           '03'
    union all
    select 'bp_qr_retained_financial', 'data',
           json_build_object(
               'artifact', 'posted financial records (immutable)',
               'status', 'retained_by_design',
               'not_residue', true,
               'qa_shared_charge_rows', coalesce((
                 select count(*)::int
                 from public.charges c
                 where c.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
               ), 0)
           )::text,
           '04'
    union all
    select 'bp_qr_retained_process_config', 'data',
           json_build_object(
               'artifact', 'published process configuration',
               'status', 'retained_by_design',
               'not_residue', true,
               'qa_shared_configuration_publication_rows', coalesce((
                 select count(*)::int
                 from public.configuration_publications cp
                 where cp.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
               ), 0)
           )::text,
           '05'
    union all
    select 'bp_qr_retained_audit', 'data',
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
           '06'
) q
order by sort_key;
