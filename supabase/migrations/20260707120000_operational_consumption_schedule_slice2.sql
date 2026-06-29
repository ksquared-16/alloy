-- =============================================================================
-- Operational Consumption — Agreement + Schedule consumption (Slice 2)
-- =============================================================================
-- Slice 1 proved the boundary with a fixed registration fee. Slice 2 teaches
-- Operational Consumption to understand RECURRING commercial obligations from an
-- agreement + schedule:
--
--   Agreement + Schedule -> Recurring Tuition Consumption -> Commercial Resolution
--     (Rate Plan + Rate Rule + Charge Template + Policies) -> Resolved Obligations
--     -> Draft Charges.   Posting remains OUT of scope.
--
-- Doctrine: docs/platform/modules/operational-consumption-platform.md
--   * Operational Scheduling answers "where should the child be?"; Operational
--     Consumption answers "what financially applies because of that schedule?"
--     They are not the same question — not every schedule mutation is commercial.
--   * One Consumption Event may resolve to zero, one, or MANY obligations
--     (e.g. a schedule replacement -> a proration credit + replacement tuition).
--   * Consumption CONSUMES the Commercial Model (Service / Rate Plan / Rate Rules
--     / Charge Templates / Financial Policies) and the existing Charge resolver;
--     it never reimplements pricing and never posts.
--
-- ADDITIVE ONLY: three nullable columns on resolved_obligations + a global seed of
-- four schedule Consumption Event Types. No frozen-table ALTERs, no money writes,
-- no new policy_type values (proration / billing_cadence / grace_period already
-- exist in financial_policies and its app registry).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- resolved_obligations: recurrence shape. A Resolved Obligation can now name its
-- KIND (recurring tuition vs proration vs drop-in vs a proration credit) and the
-- service PERIOD it covers, so recurrence is idempotent per period and the
-- explanation can describe what each obligation is. Still non-authoritative.
-- -----------------------------------------------------------------------------
ALTER TABLE public.resolved_obligations
    ADD COLUMN IF NOT EXISTS obligation_kind text,
    ADD COLUMN IF NOT EXISTS period_start date,
    ADD COLUMN IF NOT EXISTS period_end date;

COMMENT ON COLUMN public.resolved_obligations.obligation_kind IS
    'What this obligation is: registration | recurring_tuition | proration | proration_credit | drop_in | extra_day. Drives the explanation; pricing/timing still come from the Commercial Model resolver.';
COMMENT ON COLUMN public.resolved_obligations.period_start IS
    'Service period this obligation covers (recurring tuition / proration). Recurrence is idempotent per period via resolution_key.';

CREATE INDEX IF NOT EXISTS idx_resolved_obligations_org_kind
    ON public.resolved_obligations (org_id, obligation_kind) WHERE obligation_kind IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Seed the four canonical schedule Consumption Event Types (global, org_id NULL —
-- mirrors Slice 1's enrollment.registration seed). Each maps an operational
-- schedule fact to the Commercial Model Charge Template (by key) it resolves:
--   schedule.recurring_tuition -> tuition  (rate_derived)
--   schedule.proration         -> tuition  (rate_derived, prorated by policy)
--   schedule.drop_in           -> drop_in  (rate_derived, drop_in rate rule)
--   schedule.extra_day         -> drop_in  (an extra day priced at the drop-in rate)
-- A NULL match (org has no such template) is valid: the event produces no charge.
-- Idempotent: INSERT ... WHERE NOT EXISTS on the global key.
-- -----------------------------------------------------------------------------
INSERT INTO public.consumption_event_types
    (org_id, event_key, label, source_family, description, charge_template_key, default_responsibility_key, is_active, effective_start, metadata)
SELECT NULL, v.event_key, v.label, v.source_family, v.description, v.charge_template_key, v.default_responsibility_key, true, '2000-01-01'::date, v.metadata
FROM (VALUES
    (
        'schedule.recurring_tuition'::text,
        'Recurring Tuition'::text,
        'schedule'::text,
        'An active agreement + recurring schedule creates recurring tuition consumption for a service period. Resolves the rate-derived tuition Charge Template at the rate-resolved amount. Posts nothing.'::text,
        'tuition'::text,
        'household'::text,
        '{"schema_version": 1, "amount_source": "rate_resolution", "obligation_kind": "recurring_tuition"}'::jsonb
    ),
    (
        'schedule.proration'::text,
        'Schedule Proration'::text,
        'schedule'::text,
        'A temporary schedule or mid-period schedule change creates a proration consumption for the affected partial period. Amount is the rate-resolved tuition prorated by the org/plan proration policy. Credits remain preview-only (Posting is downstream).'::text,
        'tuition'::text,
        'household'::text,
        '{"schema_version": 1, "amount_source": "rate_resolution", "obligation_kind": "proration"}'::jsonb
    ),
    (
        'schedule.drop_in'::text,
        'Drop-In'::text,
        'schedule'::text,
        'A drop-in day creates a drop-in consumption. Resolves the rate-derived drop-in Charge Template at the drop_in rate rule. Posts nothing.'::text,
        'drop_in'::text,
        'household'::text,
        '{"schema_version": 1, "amount_source": "rate_resolution", "obligation_kind": "drop_in"}'::jsonb
    ),
    (
        'schedule.extra_day'::text,
        'Extra Day'::text,
        'schedule'::text,
        'An extra day beyond the recurring schedule creates an extra-day consumption, priced at the drop-in rate rule via the drop-in Charge Template. Posts nothing.'::text,
        'drop_in'::text,
        'household'::text,
        '{"schema_version": 1, "amount_source": "rate_resolution", "obligation_kind": "extra_day"}'::jsonb
    )
) AS v(event_key, label, source_family, description, charge_template_key, default_responsibility_key, metadata)
WHERE NOT EXISTS (
    SELECT 1 FROM public.consumption_event_types cet
    WHERE cet.org_id IS NULL AND cet.event_key = v.event_key
);
