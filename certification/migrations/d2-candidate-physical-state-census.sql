-- Read-only census: PHYSICAL state and LEDGER identity of the seven D2
-- candidate migrations on the deployed primary, in ONE reading.
--
-- WHY THIS EXISTS. The pre-merge apply (gar_792710a5f553ee) failed
-- `post_apply_verification_failed`, which `trusted-host-production-apply.mjs`
-- can only emit AFTER `applyBatch` returned ok — so the migrations executed and
-- the question is what survived. The ledger census answers identity only, and
-- the reading held for it executed 42 seconds BEFORE the apply began.
--
-- WHY ONE CENSUS RATHER THAN TWO. `trusted-host-ledger-repair.mjs` consumes
-- exactly this artifact: "a repair authorised against a state must be executed
-- against the same state, and two censuses taken minutes apart are two states."
-- So head, total, per-version ledger identity and the physical checks all come
-- from one statement at one moment.
--
-- THE ROW CONTRACT THE REPAIR PARSES. Every physical row is
--
--     object ~ expected ~ observed ~ match
--
-- and a version counts as PHYSICALLY_PRESENT only when it has rows and EVERY
-- row matched; anything else is partial, which the repair refuses. `match` is
-- therefore the last field, and it is the literal `true`/`false`.
--
-- Question ids are `m<last six of version>`, which is the name the repair reads
-- physical checks under; anything else is treated as "not measured".
--
-- Output contract: question_id | kind | payload. The parser consumes the first
-- two columns as identity, so the answer must be third. One statement, no DDL,
-- no writes.
with fn as (
    select p.proname::text as name,
           pg_get_function_identity_arguments(p.oid)::text as args,
           p.prosrc::text as src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
),
check_rows as (
    -- 20260911200000 — the producer, and the append-only trigger it installs.
    select 'm200000'::text as qid, 'replace_role_permission_grants'::text as obj, 'present'::text as expected,
           (case when exists (select 1 from fn where name = 'replace_role_permission_grants') then 'present' else 'absent' end)::text as observed,
           'a1'::text as sort_key
    union all
    select 'm200000', 'trigger:mutation_events_append_only', 'present',
           case when exists (select 1 from pg_trigger t where t.tgname = 'mutation_events_append_only' and not t.tgisinternal)
                then 'present' else 'absent' end, 'a1b'

    -- 20260911210000 — the remaining four audited producers.
    union all select 'm210000', 'replace_membership_with_access_profile', 'present',
           case when exists (select 1 from fn where name = 'replace_membership_with_access_profile') then 'present' else 'absent' end, 'a2a'
    union all select 'm210000', 'create_role_definition_audited', 'present',
           case when exists (select 1 from fn where name = 'create_role_definition_audited') then 'present' else 'absent' end, 'a2b'
    union all select 'm210000', 'remove_member_access_audited', 'present',
           case when exists (select 1 from fn where name = 'remove_member_access_audited') then 'present' else 'absent' end, 'a2c'
    union all select 'm210000', 'replace_member_access_scope_audited', 'present',
           case when exists (select 1 from fn where name = 'replace_member_access_scope_audited') then 'present' else 'absent' end, 'a2d'

    -- 20260911220000 — the superseded NARROW signatures are gone. Expected absent.
    union all select 'm220000', 'narrow:replace_role_permission_grants(uuid,text,text[])', 'absent',
           case when exists (select 1 from fn where name = 'replace_role_permission_grants'
                              and args = 'p_org_id uuid, p_role_key text, p_permission_keys text[]')
                then 'present' else 'absent' end, 'a3a'
    union all select 'm220000', 'narrow:save_role_definition_and_grants(uuid,text,text,boolean,text[])', 'absent',
           case when exists (select 1 from fn where name = 'save_role_definition_and_grants'
                              and args = 'p_org_id uuid, p_role_key text, p_role_label text, p_is_active boolean, p_permission_keys text[]')
                then 'present' else 'absent' end, 'a3b'
    union all select 'm220000', 'narrow:replace_membership_with_access_profile(uuid,uuid,text)', 'absent',
           case when exists (select 1 from fn where name = 'replace_membership_with_access_profile'
                              and args = 'p_org_id uuid, p_user_id uuid, p_role_key text')
                then 'present' else 'absent' end, 'a3c'

    -- 20260911230000 — the rename fix appends rather than replacing.
    union all select 'm230000', 'save_role_definition_and_grants:array_append', 'present',
           case when exists (select 1 from fn where name = 'save_role_definition_and_grants' and src like '%array_append%')
                then 'present' else 'absent' end, 'a4'

    -- 20260911240000 — removal records the scope the member held.
    union all select 'm240000', 'remove_member_access_audited:previous_state', 'present',
           case when exists (select 1 from fn where name = 'remove_member_access_audited' and src like '%previous_state%')
                then 'present' else 'absent' end, 'a5'

    -- 20260911250000 — a metadata-only save is audited too.
    union all select 'm250000', 'save_role_definition_and_grants:access.role.updated', 'present',
           case when exists (select 1 from fn where name = 'save_role_definition_and_grants' and src like '%access.role.updated%')
                then 'present' else 'absent' end, 'a6'

    -- 20260911260000 — the lockout guard.
    union all select 'm260000', 'replace_role_permission_grants:self_authority_lockout', 'present',
           case when exists (select 1 from fn where name = 'replace_role_permission_grants' and src like '%self_authority_lockout%')
                then 'present' else 'absent' end, 'a7'
)
select question_id, kind, payload
from (
    select qid as question_id,
           'physical'::text as kind,
           (obj || ' ~ ' || expected || ' ~ ' || observed || ' ~ ' ||
            (case when observed = expected then 'true' else 'false' end))::text as payload,
           sort_key
    from check_rows

    union all

    -- Per-version ledger identity, in the shape the repair reads:
    -- version ~ expected ~ observed ~ match, where match=false means "ledger lacks it".
    select 'ledger_version'::text,
           'identity'::text,
           (v.version || ' ~ ledgered ~ ' ||
            (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                  then 'present' else 'absent' end) || ' ~ ' ||
            (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                  then 'true' else 'false' end))::text,
           'b' || v.version
    from (values ('20260911200000'),('20260911210000'),('20260911220000'),('20260911230000'),
                 ('20260911240000'),('20260911250000'),('20260911260000')) as v(version)

    union all
    select 'ledger_head'::text, 'max'::text, coalesce(max(m.version)::text, 'none'), 'zz1'::text
    from supabase_migrations.schema_migrations m

    union all
    select 'ledger_total'::text, 'count'::text, count(*)::text, 'zz2'::text
    from supabase_migrations.schema_migrations m
) rows
order by sort_key;
