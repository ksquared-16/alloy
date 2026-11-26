-- Trust Adoption Phase 2.5 — provider / model / locality telemetry persistence.
--
-- The FIRST migration of the Trust Platform Adoption program. Phases 0 through
-- 2.4 shipped without one; this is the point where a schema fact genuinely could
-- not be expressed by the existing columns.
--
-- The gap it closes. Phase 2.4's governed execution seam can know which provider
-- answered, which model, whether inference ran locally, and what the provider
-- said it spent. `trust_reasoning_usage` could hold none of it, so every one of
-- those facts died at the end of the request. Operational Intelligence documents
-- its own blindness today: "the schema records no provider identity", and
-- "Local-model execution is NOT distinguishable from deterministic in the
-- current schema". Both statements stop being true here.
--
-- Four dimensions, kept apart, exactly as the execution contract keeps them:
--   provider identity   provider_key
--   model identity      model_key, model_version
--   execution location  execution_location
--   reasoning kind      DERIVED, not stored — `strategy_kind` already records it
--                       and `lib/trust/reasoning/executionCapability.ts` maps it
--                       to provider-capable. A second column would be a second
--                       truth to keep in sync.
--
-- Everything added is NULLABLE and additive. No historical row is rewritten and
-- no value is inferred: a row from before this migration has no provider, and
-- saying so is more useful than guessing. `unknown` locality is a value an
-- adapter may assert; NULL means nothing was recorded at all. They are different
-- statements and the schema keeps them different.
--
-- Nothing here weakens the table: RLS, the append-only trigger, org scoping, the
-- contract linkage and the existing index are all untouched. ADD COLUMN is DDL,
-- so the trigger that refuses UPDATE and DELETE is unaffected.

-- -----------------------------------------------------------------------------
-- Provider, model and execution locality
-- -----------------------------------------------------------------------------

ALTER TABLE public.trust_reasoning_usage
    ADD COLUMN IF NOT EXISTS provider_key text,
    ADD COLUMN IF NOT EXISTS model_key text,
    ADD COLUMN IF NOT EXISTS model_version text,
    ADD COLUMN IF NOT EXISTS execution_location text;

COMMENT ON COLUMN public.trust_reasoning_usage.provider_key IS
    'Which provider answered. NULL for deterministic reasoning, where no provider participated.';
COMMENT ON COLUMN public.trust_reasoning_usage.model_key IS
    'Which model answered. NULL when no provider ran, or when the provider did not say.';
COMMENT ON COLUMN public.trust_reasoning_usage.model_version IS
    'Provider-reported model version. NULL when unreported.';
COMMENT ON COLUMN public.trust_reasoning_usage.execution_location IS
    'local | remote | unknown, as ASSERTED by the adapter. NULL means no execution was recorded; '
    '"unknown" means an adapter ran but could not prove where. Never inferred from provider name.';

-- `unknown` is a real answer, so it is in the allowed set. NULL is permitted
-- because a deterministic row has no execution location at all — the CHECK
-- admits NULL rather than forcing every historical row to claim "unknown".
ALTER TABLE public.trust_reasoning_usage
    DROP CONSTRAINT IF EXISTS chk_tru_execution_location;
ALTER TABLE public.trust_reasoning_usage
    ADD CONSTRAINT chk_tru_execution_location
    CHECK (execution_location IS NULL OR execution_location IN ('local', 'remote', 'unknown'));

-- -----------------------------------------------------------------------------
-- Provider-reported usage
-- -----------------------------------------------------------------------------
--
-- Separate from `provider_cost_units`, which is NOT NULL DEFAULT 0 and records
-- what the STRATEGY measured. That column cannot distinguish "a deterministic
-- execution genuinely cost nothing" from "a provider ran and reported no cost" —
-- both read as 0. These columns are nullable precisely so absence stays absent:
-- NULL means the provider reported nothing, and 0 means it reported zero.

ALTER TABLE public.trust_reasoning_usage
    ADD COLUMN IF NOT EXISTS input_units numeric,
    ADD COLUMN IF NOT EXISTS output_units numeric,
    ADD COLUMN IF NOT EXISTS provider_reported_cost_units numeric;

COMMENT ON COLUMN public.trust_reasoning_usage.input_units IS
    'Provider-reported input units/tokens. NULL when the provider reported none — never zero-filled.';
COMMENT ON COLUMN public.trust_reasoning_usage.output_units IS
    'Provider-reported output units/tokens. NULL when the provider reported none — never zero-filled.';
COMMENT ON COLUMN public.trust_reasoning_usage.provider_reported_cost_units IS
    'What the PROVIDER said it cost, when it said anything. Distinct from provider_cost_units, '
    'which is the strategy-measured cost and is NOT NULL DEFAULT 0.';

ALTER TABLE public.trust_reasoning_usage
    DROP CONSTRAINT IF EXISTS chk_tru_provider_usage_non_negative;
ALTER TABLE public.trust_reasoning_usage
    ADD CONSTRAINT chk_tru_provider_usage_non_negative
    CHECK (
        (input_units IS NULL OR input_units >= 0)
        AND (output_units IS NULL OR output_units >= 0)
        AND (provider_reported_cost_units IS NULL OR provider_reported_cost_units >= 0)
    );

-- -----------------------------------------------------------------------------
-- Aggregation index
-- -----------------------------------------------------------------------------
--
-- Additive and PARTIAL: provider aggregation only ever asks about rows where a
-- provider participated, so deterministic rows — every row that exists today —
-- pay nothing for it.

CREATE INDEX IF NOT EXISTS idx_tru_org_provider_recorded
    ON public.trust_reasoning_usage (org_id, provider_key, recorded_at DESC)
    WHERE provider_key IS NOT NULL;

COMMENT ON TABLE public.trust_reasoning_usage IS
    'Trust Runtime: append-only economics per contract, including provider/model/locality identity '
    'when a provider participated. Aggregated by Operational Intelligence; never read by reasoning.';
