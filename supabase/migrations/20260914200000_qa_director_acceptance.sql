-- =============================================================================
-- HUMAN ACCEPTANCE, RECORDED WHERE IT CANNOT BE MISTAKEN FOR MONEY.
--
-- A Director working through Core Financials produces a different kind of fact from anything the
-- Financials tables hold. "Kelly agreed this behaved correctly" is testimony about a build; it is
-- not a charge, a payment, or a balance, and putting it beside them would eventually let an
-- acceptance record be read as financial state. So it lives here, in its own table, in its own
-- vocabulary.
--
-- ── THE REVISION IS PART OF THE FACT ────────────────────────────────────────────────────────────
--
-- An acceptance is only ever true of the build it was given. A PASS recorded against one deployed
-- revision says nothing about the next one, and the difference matters most exactly when it is
-- least visible — a financial fix ships mid-walkthrough and yesterday's ticks would silently
-- vouch for code nobody looked at. `deployed_revision` is therefore part of the identity of a
-- result, not metadata beside it: a new build starts a new column of results and leaves the old
-- ones legible rather than overwriting them.
--
-- `scenario_definition_version` is the same argument applied to the QUESTION rather than the build.
-- If a scenario is rewritten, an answer given to the previous wording is not an answer to this one.
--
-- ── WHAT THIS TABLE MAY NEVER BECOME ────────────────────────────────────────────────────────────
--
-- It holds no amounts and references no financial row by foreign key. The QA harness reads money
-- through the canonical Financials readers and writes money only through canonical product actions.
-- Nothing here is an input to any balance, and a defect that let it become one would be a serious
-- one: the point of a QA store is to observe the product, never to participate in it.
-- =============================================================================

create table if not exists public.qa_director_acceptance_results (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete cascade,

    /* Which acceptance program. One row per suite lets a second program exist later without
       inheriting this one's scenario keys. */
    suite_key text not null,
    scenario_key text not null,
    /* The wording the tester actually answered. */
    scenario_definition_version text not null,

    environment text not null,
    /* The build this testimony is about. Part of the identity, never decoration. */
    deployed_revision text not null,

    tester_user_id uuid not null,
    tester_email text,

    result text not null check (result in ('pass', 'fail', 'blocked', 'not_run')),

    /* What the tester actually saw, in their words. Required for anything that is not a pass. */
    observation text,
    expected_result text,
    /* Why it failed, chosen by the human rather than guessed by the harness. */
    classification text check (classification in (
        'PRODUCT_DEFECT', 'CONFUSING_UX', 'GUIDE_MISMATCH',
        'FIXTURE_DRIFT', 'ENVIRONMENT_RUNTIME', 'UNKNOWN_NEEDS_TRIAGE'
    )),
    evidence_reference text,

    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    /* A failure that explains nothing cannot be triaged, and an unexplained failure is how a real
       defect becomes a shrug three weeks later. */
    constraint qa_director_acceptance_failure_is_explained check (
        result not in ('fail', 'blocked')
        or (observation is not null and btrim(observation) <> '' and classification is not null)
    )
);

/* One live answer per tester, per scenario, per BUILD. Re-answering updates; a new build does not
   overwrite the old testimony, it starts its own. */
create unique index if not exists qa_director_acceptance_results_answer_unique
    on public.qa_director_acceptance_results
    (org_id, suite_key, scenario_key, deployed_revision, tester_user_id);

create index if not exists qa_director_acceptance_results_suite_idx
    on public.qa_director_acceptance_results (org_id, suite_key, deployed_revision);

alter table public.qa_director_acceptance_results enable row level security;

drop policy if exists qa_director_acceptance_results_select_org on public.qa_director_acceptance_results;
create policy qa_director_acceptance_results_select_org
    on public.qa_director_acceptance_results for select
    using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.org_id = qa_director_acceptance_results.org_id
    ));

/* Recording acceptance is an operator act, held to the same roles as other operational writes. */
drop policy if exists qa_director_acceptance_results_mutate_ops on public.qa_director_acceptance_results;
create policy qa_director_acceptance_results_mutate_ops
    on public.qa_director_acceptance_results for all
    using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.org_id = qa_director_acceptance_results.org_id
          and ur.role = any (array['owner', 'admin', 'ops'])
    ));

drop policy if exists qa_director_acceptance_results_service_all on public.qa_director_acceptance_results;
create policy qa_director_acceptance_results_service_all
    on public.qa_director_acceptance_results for all
    using (auth.role() = 'service_role');

comment on table public.qa_director_acceptance_results is
    'Human acceptance testimony for an internal QA program: who judged which scenario, on which '
    'build, against which wording of the question, and what they actually saw. Holds no amounts and '
    'references no financial row. It observes the product and never participates in it.';
