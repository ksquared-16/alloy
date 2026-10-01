-- Read-only, CATALOG-ONLY: are the two Identity/Access repair migrations actually
-- in the deployed ledger, BY VERSION?
--
-- WHY THIS EXISTS, AND WHY max_version WAS NOT ENOUGH.
-- `identityAccessCertificationEvidence.test.ts` gates certification on the hosted
-- ledger having advanced to or past `20261104130000`. That test was written when the
-- two repair migrations were the newest in the tree, and the check was sound only
-- because of that accident. It stopped being sound the moment another lane landed
-- `20261105120000` and `20261106120000` (PR 1345): once those apply,
-- `max_version` reads 20261106120000, which satisfies `>= 20261104130000` while
-- saying NOTHING about whether either repair migration ran.
--
-- A gate that another team's unrelated migration can satisfy is not a gate. The
-- question has to be asked per version, so it is asked per version here.
--
-- 20261107120000 JOINED THE REQUIRED SET on 2026-09-30. It closes post_ledger_transaction,
-- which 20261104120000 missed because that migration matched on parameter names. Adding it here
-- was not cosmetic: the certification gate reads THIS list, so while the list held only the
-- first two versions the gate would have certified Identity/Access with the follow-up migration
-- entirely absent. A required-version list that lags the requirements is a gate with a hole in it.
--
-- The ledger is infrastructure (`supabase_migrations.schema_migrations`), not
-- application data; no tenant row is read.
select question_id, kind, payload
from (
    -- One row per repair migration, answering only: is this exact version applied?
    select 'v_applied'::text as question_id, 'version'::text as kind,
           ('migration ~ ' || v.version || ' ~ '
            || (exists (select 1 from supabase_migrations.schema_migrations m
                         where m.version = v.version))::text)::text as payload,
           ('v01_' || v.version)::text as sort_key
      from (values ('20261104120000'), ('20261104130000'), ('20261107120000')) as v(version)
    union all
    -- Context, so a reader can see where the ledger actually stands. Deliberately
    -- NOT the thing the gate reads.
    select 'v_applied', 'context',
           'schema_migrations ~ max_version ~ '
           || coalesce((select max(version) from supabase_migrations.schema_migrations), 'none'),
           'v02'
    union all
    select 'v_applied', 'context',
           'schema_migrations ~ applied_total ~ '
           || (select count(*) from supabase_migrations.schema_migrations),
           'v03'
    union all
    -- The two versions another lane landed above ours, named explicitly so the
    -- false-positive path this census exists to close is visible in the evidence.
    select 'v_applied', 'context',
           'sibling_lane_migration ~ ' || v.version || ' ~ '
           || (exists (select 1 from supabase_migrations.schema_migrations m
                        where m.version = v.version))::text,
           'v04_' || v.version
      from (values ('20261105120000'), ('20261106120000')) as v(version)
) q
order by sort_key, payload;
