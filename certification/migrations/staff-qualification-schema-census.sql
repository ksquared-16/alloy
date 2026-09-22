-- Read-only census: does the database PHYSICALLY carry Slice 3's qualification
-- authority — tables, the constraints that make the facts honest, the indexes the
-- reads depend on, and the foreign keys that bind them?
--
-- A migration ledger row says a file RAN. It does not say a CHECK exists, and a
-- CHECK that does not exist is the difference between "a qualification cannot
-- expire before it was issued" and a hope. So this asks the catalog directly and
-- reports the ledger only as a cross-check.
--
-- Run BEFORE the apply it must answer "false" to every structural row, and AFTER
-- it must answer "true" to every one. Same bytes both times, so the readings are
-- comparable; separate runs are what make the second a measurement and not a
-- replay of the first.
--
-- Output obeys the trusted-host parser: question_id | kind | payload.
select question_id, kind, payload
from (
    -- ── THE FOUR TABLES ──
    select 'tbl_types'::text, 'present'::text,
           (to_regclass('public.staff_qualification_types') is not null)::text, 'a01'::text
    union all
    select 'tbl_qualifications'::text, 'present'::text,
           (to_regclass('public.staff_qualifications') is not null)::text, 'a02'::text
    union all
    select 'tbl_evidence'::text, 'present'::text,
           (to_regclass('public.staff_qualification_evidence') is not null)::text, 'a03'::text
    union all
    select 'tbl_requirements'::text, 'present'::text,
           (to_regclass('public.staff_qualification_requirements') is not null)::text, 'a04'::text

    -- ── THE CONSTRAINTS THAT CARRY THE MEANING ──
    -- Each is named, because a constraint with the right shape under a different
    -- name is a different object and the next migration will not find it.
    union all
    select 'ck_types_key_format'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_types_key_format_check'))::text, 'a05'::text
    union all
    select 'ck_types_label_not_blank'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_types_label_not_blank_check'))::text, 'a06'::text
    union all
    select 'ck_types_validity_positive'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_types_validity_positive_check'))::text, 'a07'::text
    union all
    select 'uq_types_org_key'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_types_org_key_key'
                      and contype='u'))::text, 'a08'::text
    union all
    -- The date order check is the one that makes expiration derivable rather than
    -- asserted: without it a row can claim to expire before it was issued.
    select 'ck_qual_date_order'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualifications_date_order_check'))::text, 'a09'::text
    union all
    select 'ck_qual_verification_state'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualifications_verification_state_check'))::text, 'a10'::text
    union all
    select 'ck_qual_verified_has_timestamp'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualifications_verified_has_timestamp_check'))::text, 'a11'::text
    union all
    select 'ck_qual_no_self_supersede'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualifications_no_self_supersede_check'))::text, 'a12'::text
    union all
    select 'ck_qual_revoked_has_timestamp'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualifications_revoked_has_timestamp_check'))::text, 'a13'::text
    union all
    select 'uq_evidence_qualification_document'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_evidence_unique'
                      and contype='u'))::text, 'a14'::text
    union all
    select 'ck_req_scope_type'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_requirements_scope_type_check'))::text, 'a15'::text
    union all
    -- Scope-id presence is what stops "required at a site" with no site named.
    select 'ck_req_scope_id_presence'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_requirements_scope_id_presence_check'))::text, 'a16'::text
    union all
    select 'ck_req_level'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_requirements_level_check'))::text, 'a17'::text
    union all
    select 'ck_req_date_order'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_requirements_date_order_check'))::text, 'a18'::text
    union all
    select 'uq_req_scope'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_qualification_requirements_unique_scope'
                      and contype='u'))::text, 'a19'::text

    -- ── THE INDEXES THE READS DEPEND ON ──
    union all
    select 'idx_types_org_active'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='staff_qualification_types_org_active_idx'))::text, 'a20'::text
    union all
    select 'idx_qual_org_employment'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='staff_qualifications_org_employment_idx'))::text, 'a21'::text
    union all
    select 'idx_qual_org_expiry'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='staff_qualifications_org_expiry_idx'))::text, 'a22'::text
    union all
    select 'idx_evidence_qualification'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='staff_qualification_evidence_qualification_idx'))::text, 'a23'::text
    union all
    select 'idx_req_org_scope'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='staff_qualification_requirements_org_scope_idx'))::text, 'a24'::text

    -- ── THE FOREIGN KEYS THAT BIND THE GRAIN ──
    -- The grain claim is "a qualification belongs to an EMPLOYMENT, not a person".
    -- That claim is only true if the column actually references employments.
    union all
    select 'fk_qual_employment'::text, 'present'::text,
           (exists (select 1 from pg_constraint c
                    where c.conrelid=to_regclass('public.staff_qualifications')
                      and c.contype='f'
                      and c.confrelid=to_regclass('public.employments')))::text, 'a25'::text
    union all
    select 'fk_qual_type'::text, 'present'::text,
           (exists (select 1 from pg_constraint c
                    where c.conrelid=to_regclass('public.staff_qualifications')
                      and c.contype='f'
                      and c.confrelid=to_regclass('public.staff_qualification_types')))::text, 'a26'::text
    union all
    -- Evidence REFERENCES a document; it does not copy one. If this FK is absent
    -- the column is a loose uuid and the "referenced, never duplicated" claim is
    -- prose rather than structure.
    select 'fk_evidence_document'::text, 'present'::text,
           (exists (select 1 from pg_constraint c
                    where c.conrelid=to_regclass('public.staff_qualification_evidence')
                      and c.contype='f'
                      and c.confrelid=to_regclass('public.documents')))::text, 'a27'::text
    union all
    select 'fk_req_type'::text, 'present'::text,
           (exists (select 1 from pg_constraint c
                    where c.conrelid=to_regclass('public.staff_qualification_requirements')
                      and c.contype='f'
                      and c.confrelid=to_regclass('public.staff_qualification_types')))::text, 'a28'::text

    -- ── WHAT IS DELIBERATELY ABSENT ──
    -- No stored `is_expired`. Expiration is DERIVED against the org's day; a
    -- stored flag would be wrong every night at midnight until something ran.
    union all
    select 'no_stored_is_expired_column'::text, 'present'::text,
           (not exists (select 1 from information_schema.columns
                        where table_schema='public'
                          and table_name='staff_qualifications'
                          and column_name='is_expired'))::text, 'a29'::text

    -- ── ROW SECURITY — EXPECTED TRUE ──
    -- This started as a neutral report and became a GATE, because the first
    -- reading returned false on all four with zero policies while the schema's
    -- default privileges grant `authenticated` SELECT on every new public table.
    -- Expected now: true on all four, policies > 0, matching the employments and
    -- documents baselines carried alongside them.
    union all
    select 'rls_enabled_types'::text, 'present'::text,
           (select relrowsecurity::text from pg_class
            where oid=to_regclass('public.staff_qualification_types')), 'a30'::text
    union all
    select 'rls_enabled_qualifications'::text, 'present'::text,
           (select relrowsecurity::text from pg_class
            where oid=to_regclass('public.staff_qualifications')), 'a31'::text

    -- ── PRIMARY KEYS ──
    -- Asked by CLASS, not by name: a primary key generated under the default
    -- name is still the constraint that makes the row addressable.
    union all
    select 'pk_types'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conrelid=to_regclass('public.staff_qualification_types')
                      and contype='p'))::text, 'b01'::text
    union all
    select 'pk_qualifications'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conrelid=to_regclass('public.staff_qualifications')
                      and contype='p'))::text, 'b02'::text
    union all
    select 'pk_evidence'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conrelid=to_regclass('public.staff_qualification_evidence')
                      and contype='p'))::text, 'b03'::text
    union all
    select 'pk_requirements'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conrelid=to_regclass('public.staff_qualification_requirements')
                      and contype='p'))::text, 'b04'::text

    -- ── ORG OWNERSHIP ──
    -- Every one of the four carries org_id NOT NULL and references orgs. Without
    -- both, a row can exist that belongs to no tenant, and every scoped read in
    -- the service layer silently stops being a boundary.
    union all
    select 'org_id_not_null_types'::text, 'present'::text,
           (exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='staff_qualification_types'
                      and column_name='org_id' and is_nullable='NO'))::text, 'b05'::text
    union all
    select 'org_id_not_null_qualifications'::text, 'present'::text,
           (exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='staff_qualifications'
                      and column_name='org_id' and is_nullable='NO'))::text, 'b06'::text
    union all
    select 'org_id_not_null_evidence'::text, 'present'::text,
           (exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='staff_qualification_evidence'
                      and column_name='org_id' and is_nullable='NO'))::text, 'b07'::text
    union all
    select 'org_id_not_null_requirements'::text, 'present'::text,
           (exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='staff_qualification_requirements'
                      and column_name='org_id' and is_nullable='NO'))::text, 'b08'::text
    union all
    select 'fk_org_all_four'::text, 'count'::text,
           (select count(*)::text from pg_constraint c
            where c.contype='f'
              and c.confrelid=to_regclass('public.orgs')
              and c.conrelid in (
                    to_regclass('public.staff_qualification_types'),
                    to_regclass('public.staff_qualifications'),
                    to_regclass('public.staff_qualification_evidence'),
                    to_regclass('public.staff_qualification_requirements'))), 'b09'::text

    -- ── EVIDENCE RELATIONSHIP, BOTH ENDS ──
    union all
    select 'fk_evidence_qualification'::text, 'present'::text,
           (exists (select 1 from pg_constraint c
                    where c.conrelid=to_regclass('public.staff_qualification_evidence')
                      and c.contype='f'
                      and c.confrelid=to_regclass('public.staff_qualifications')))::text, 'b10'::text

    -- ── SUPERSESSION / HISTORY ──
    -- Renewal is record-with-supersedes, so the self-reference IS the history.
    union all
    select 'fk_qual_supersedes_self'::text, 'present'::text,
           (exists (select 1 from pg_constraint c
                    where c.conrelid=to_regclass('public.staff_qualifications')
                      and c.contype='f'
                      and c.confrelid=to_regclass('public.staff_qualifications')))::text, 'b11'::text
    union all
    select 'col_supersedes_qualification_id'::text, 'present'::text,
           (exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='staff_qualifications'
                      and column_name='supersedes_qualification_id'))::text, 'b12'::text

    -- ── ROW SECURITY, MEASURED AGAINST THE TABLES THESE HANG OFF ──
    -- The baselines are carried so the answer is a COMPARISON. `employments` and
    -- `documents` are the canonical tables a qualification references; a boundary
    -- weaker than theirs is the weaker of the two everywhere the two meet.
    union all
    select 'rls_enabled_evidence'::text, 'present'::text,
           (select relrowsecurity::text from pg_class
            where oid=to_regclass('public.staff_qualification_evidence')), 'b13'::text
    union all
    select 'rls_enabled_requirements'::text, 'present'::text,
           (select relrowsecurity::text from pg_class
            where oid=to_regclass('public.staff_qualification_requirements')), 'b14'::text
    union all
    select 'rls_enabled_employments_baseline'::text, 'present'::text,
           (select relrowsecurity::text from pg_class
            where oid=to_regclass('public.employments')), 'b15'::text
    union all
    select 'rls_enabled_documents_baseline'::text, 'present'::text,
           (select relrowsecurity::text from pg_class
            where oid=to_regclass('public.documents')), 'b16'::text
    union all
    select 'policies_on_slice3_tables'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public'
              and tablename in ('staff_qualification_types','staff_qualifications',
                                'staff_qualification_evidence','staff_qualification_requirements')), 'b17'::text
    union all
    select 'policies_on_employments_baseline'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename='employments'), 'b18'::text

    -- ── LEDGER CROSS-CHECK, AND EXISTING DATA STILL READABLE ──
    union all
    select 'ledger_has_20260926120000'::text, 'present'::text,
           (exists (select 1 from supabase_migrations.schema_migrations
                    where version='20260926120000'))::text, 'a32'::text
    union all
    select 'employments_total'::text, 'count'::text,
           (select count(*)::text from public.employments), 'a33'::text
) rows(question_id, kind, payload, sort_key)
order by sort_key;
