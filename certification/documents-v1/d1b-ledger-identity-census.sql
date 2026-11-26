-- Documents V1 / D1b -- deployed migration-ledger identity preflight for the two D1b versions. READ-ONLY.
--
-- Director authorization: "DOCUMENTS D1b MIGRATION RESUME ... read the deployed staging migration ledger
-- for versions 20261207181500 and 20261207181600, checking each version individually" (2026-10-23).
-- Identity is the toolkit's own (migration-state.mjs classifyMigrationState):
--   one statement, sha256(statements[1]) = the repository file's sha256, and the same name.
-- Each version is answered on its own row, whether or not it is present. One statement;
-- question_id | row_kind | payload(json).
select question_id, 'data' as row_kind, payload
from (
    select 'l00_identity'::text as question_id,
           json_build_object(
               'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
               'ledger_rows', (select count(*) from supabase_migrations.schema_migrations)
           )::text as payload

    union all

    select 'l01_version',
           json_build_object(
               'version', v.version,
               'expected_name', v.expected_name,
               'expected_sha256', v.expected_sha256,
               'present', m.version is not null,
               'recorded_name', m.name,
               'statements', coalesce(cardinality(m.statements), 0),
               'recorded_sha256', case when m.version is not null and cardinality(m.statements) >= 1
                                       then encode(sha256(convert_to(m.statements[1], 'UTF8')), 'hex') end,
               'identity_matches', case when m.version is null then null
                                        else cardinality(m.statements) = 1
                                             and encode(sha256(convert_to(m.statements[1], 'UTF8')), 'hex') = v.expected_sha256
                                             and m.name = v.expected_name end
           )::text
    from (values
        ('20261207181500', 'documents_direct_access_revocation', '36cba5183ac7d06d487bcf1d968ea7bd0f0c16ce4594ff52270911c11567caef'),
        ('20261207181600', 'org_documents_bucket_governance', '518001ead97ecd2afc80ccf5920e3c30b18c3f672e563cddcf13b74a5b53451a'),
        ('20261206090000', 'tour_booking_slot_capacity_guard', null)
    ) as v(version, expected_name, expected_sha256)
    left join supabase_migrations.schema_migrations m on m.version = v.version
) census
order by question_id, payload
