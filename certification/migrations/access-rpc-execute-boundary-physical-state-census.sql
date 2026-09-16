-- Read-only census: is the Access RPC execute boundary actually closed on the
-- target, or does the ledger merely say the migration ran?
--
-- The exploit this measures was demonstrated end to end: a user holding only
-- `portal.access` called /rest/v1/rpc/assign_member_role_audited with their own
-- JWT, named the seeded administrator as `p_actor_user_id`, and was granted the
-- power to assign the `admin` role. Both delegation ceilings read that
-- caller-supplied actor, so anyone who can execute the function directly skips
-- the capability gate that lives in the route.
--
-- The exposure came from a DEFAULT, not a grant: PostgreSQL gives PUBLIC EXECUTE
-- on new functions and Supabase exposes `public` through PostgREST. So the
-- question is not "did a statement run" but "what can an ordinary client execute
-- right now", which is what these rows read.
select question_id, kind, payload
from (
    -- 1. NOTHING TAKING A CALLER-SUPPLIED ACTOR IS REACHABLE BY AN ORDINARY CLIENT.
    select 'm915160000'::text as question_id, 'check'::text as kind,
           ('access_rpc_boundary ~ closed ~ no_actor_taking_function_open_to_clients ~ '
            || coalesce((select (count(*) = 0)::text
                         from public.access_rpc_boundary_report() r
                        where r.open_to_clients), 'false'))::text as payload,
           '1a'::text as sort_key
    union all

    -- 2. NON-VACUITY. A reporter that returned nothing would satisfy row 1 for the
    --    worst possible reason.
    select 'm915160000', 'check',
           'access_rpc_boundary ~ non_vacuous ~ guards_more_than_ten_functions ~ '
           || coalesce((select (count(*) > 10)::text from public.access_rpc_boundary_report()), 'false'),
           '1b'
    union all

    -- 3. THE BOUNDARY IS NOT A WALL. Revoking from everyone would also pass row 1
    --    and would break every Access route in the product.
    select 'm915160000', 'check',
           'access_rpc_boundary ~ usable ~ every_owner_keeps_service_role ~ '
           || coalesce((select (count(*) = 0)::text
                         from public.access_rpc_boundary_report() r
                        where not r.has_service_role), 'false'),
           '1c'
    union all

    -- 4. THE NAMED OWNERS ARE IN THE GUARDED SET. If the scan drifted off these,
    --    rows 1-3 would be true about the wrong functions.
    select 'm915160000', 'check',
           'access_rpc_boundary ~ covers ~ the_four_authority_owners ~ '
           || coalesce((select (count(*) = 4)::text
                         from public.access_rpc_boundary_report() r
                        where r.proname in ('replace_role_permission_grants',
                                            'assign_member_role_audited',
                                            'create_membership_with_access_profile',
                                            'replace_member_access_scope_audited')), 'false'),
           '1d'

    union all
    select 'ledger_version', 'row',
           v.version || ' ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)::text,
           '3' || v.version
    from (values ('20260915160000')) as v(version)
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '4'
) rows
order by sort_key;
