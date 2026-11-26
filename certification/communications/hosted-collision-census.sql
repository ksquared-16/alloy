-- Which body actually ran at version 20260818200000?
--
-- Two files claim that version. The ledger records the version, not the file, so it cannot
-- answer this. Only the physical schema can, and the two bodies leave completely different
-- fingerprints:
--
--   Communications  -> two columns on communication_ingress_eligibility_observations.
--                      No other migration in the tree adds them, so their presence is
--                      decisive rather than circumstantial.
--
--   W-28            -> public.replace_role_permission_grants(uuid, text, text[]).
--                      No migration BEFORE 20260818200000 defines it, and the only other
--                      file that does (20260818210000, W-58) is not on hosted. So its
--                      existence is decisive too.
--
-- Both probes are absence-shaped, and absence proves nothing without a control: a query that
-- silently matched nothing looks exactly like a feature that was never installed. So each
-- probe ships with a count from the same catalog view. If a control comes back zero, the
-- probe is broken and the verdict is INDETERMINATE, not "skipped".
--
-- Read-only: one statement, no DDL, no writes.
select
    question_id,
    'data' as row_kind,
    payload
from (
    -- COMMUNICATIONS FINGERPRINT
    select
        'comms_columns'::text as question_id,
        json_build_object('column_name', c.column_name, 'data_type', c.data_type)::text as payload
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'communication_ingress_eligibility_observations'
      and c.column_name in ('sender_authentication', 'sender_authentication_evidence')

    union all

    -- Control: the table itself must be visible to this probe, and it must have columns.
    -- Zero here means the probe cannot see the table at all.
    select
        'comms_columns_control'::text,
        json_build_object('total_columns_on_table', count(*))::text
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'communication_ingress_eligibility_observations'

    union all

    -- W-28 FINGERPRINT
    select
        'w28_function'::text,
        json_build_object(
            'proname',   p.proname,
            'arguments', pg_get_function_identity_arguments(p.oid),
            'result',    pg_get_function_result(p.oid)
        )::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'replace_role_permission_grants'

    union all

    -- Control: the catalog probe must be able to find functions at all.
    select
        'w28_function_control'::text,
        json_build_object('public_functions', count(*))::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
) census
order by question_id, payload
