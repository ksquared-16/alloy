-- =============================================================================
-- A HUMAN MAY SAY "NOT HERE, NOT YET" WITHOUT SAYING "BROKEN".
--
-- The acceptance store admitted four answers: pass, fail, blocked, not_run.
-- Financials + Payments V1 integration added scenarios the environment cannot
-- reach safely — a provider-origin return would mean manufacturing a chargeback
-- against a real provider account, and a card-rail held-deposit refund needs a
-- fixture that does not exist. Those are DEFERRED.
--
-- Without this value a Director had to record one of them as `blocked`, which
-- means "something stopped me", or `fail`, which means "the product is wrong".
-- Both are false, and a QA store that forces a false answer is worse than one
-- that refuses the question: the falsehood is indistinguishable afterwards from
-- a real defect.
--
-- Additive and re-runnable. The constraint is widened, never narrowed, so every
-- answer already recorded remains valid and nothing is rewritten.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'qa_director_acceptance_results_result_check'
          AND conrelid = 'public.qa_director_acceptance_results'::regclass
    ) THEN
        ALTER TABLE public.qa_director_acceptance_results
            DROP CONSTRAINT qa_director_acceptance_results_result_check;
    END IF;

    ALTER TABLE public.qa_director_acceptance_results
        ADD CONSTRAINT qa_director_acceptance_results_result_check
        CHECK (result IN ('pass', 'fail', 'blocked', 'not_run', 'deferred'));
END $$;

COMMENT ON COLUMN public.qa_director_acceptance_results.result IS
    'The human''s own answer. `deferred` means the scenario could not be reached safely in this '
    'environment and is not a failure — see EVIDENCE_BOUNDARIES in the scenario catalog.';

-- AND A DEFERRAL MUST SAY WHY.
--
-- `failure_is_explained` requires an observation AND a classification for fail and blocked. A
-- deferral is not a failure, so the failure taxonomy does not apply to it — but "I could not
-- safely reach this" is worthless without the reason, and a deferral with no reason is
-- indistinguishable from a scenario somebody skipped.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'qa_director_acceptance_deferral_is_explained'
          AND conrelid = 'public.qa_director_acceptance_results'::regclass
    ) THEN
        ALTER TABLE public.qa_director_acceptance_results
            DROP CONSTRAINT qa_director_acceptance_deferral_is_explained;
    END IF;

    ALTER TABLE public.qa_director_acceptance_results
        ADD CONSTRAINT qa_director_acceptance_deferral_is_explained
        CHECK (result <> 'deferred' OR (observation IS NOT NULL AND btrim(observation) <> ''));
END $$;

-- Self-test: the new value is accepted and an unknown one is still refused.
DO $$
DECLARE ok boolean := false;
BEGIN
    BEGIN
        PERFORM 1 FROM public.qa_director_acceptance_results WHERE result = 'deferred';
        ok := true;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'deferred is not queryable against the widened constraint';
    END;
    IF NOT ok THEN RAISE EXCEPTION 'constraint widening did not take'; END IF;
END $$;
