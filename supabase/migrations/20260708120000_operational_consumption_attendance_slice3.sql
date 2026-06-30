-- =============================================================================
-- Operational Consumption — Consumption Pipeline + Attendance consumption (Slice 3)
-- =============================================================================
-- Slice 3 introduces the canonical Consumption Pipeline:
--
--   Operational Fact → Consumption Candidate → Consumption Event →
--   Commercial Resolution → Resolved Obligation → Draft Charge.
--
-- A Consumption Candidate is a normalized RUNTIME interpretation (NOT a persisted
-- financial record), so it needs no table. Attendance becomes the first consumer
-- of the pipeline. This migration only SEEDS the attendance Consumption Event
-- catalog (consumption_events already records source_family + event_key + context,
-- which captures candidate provenance such as attendance_fact_type + discard_reason).
--
-- Doctrine: docs/platform/modules/operational-consumption-platform.md
--   * Not every attendance fact becomes a Consumption Event — the pipeline decides.
--   * Consumption CONSUMES the Commercial Model (Charge Templates / Rate Rules /
--     Policies); it reimplements no pricing and introduces no Posting.
--
-- ADDITIVE ONLY: a global seed of attendance.* Consumption Event Types. No table
-- or column changes, no money writes, no new policy types.
--
-- Charge-template mapping (resolved per-org at runtime; NULL => no charge):
--   attendance.late_pickup  -> late_pickup (fixed fee)
--   attendance.drop_in      -> drop_in     (rate-derived, drop_in rule)
--   attendance.extra_day    -> drop_in
--   attendance.extended_day -> drop_in
--   attendance.hourly_care  -> hourly_care (rate-derived, hourly rule × hours)
--   attendance.no_show      -> NULL        (a fee applies only if the org configures one)
--   attendance.vacation_credit -> NULL     (a credit; preview-only, posts downstream)
-- =============================================================================

INSERT INTO public.consumption_event_types
    (org_id, event_key, label, source_family, description, charge_template_key, default_responsibility_key, is_active, effective_start, metadata)
SELECT NULL, v.event_key, v.label, v.source_family, v.description, v.charge_template_key, v.default_responsibility_key, true, '2000-01-01'::date, v.metadata
FROM (VALUES
    (
        'attendance.late_pickup'::text, 'Late Pickup'::text, 'attendance'::text,
        'A check-out after the late threshold creates a late-pickup consumption. Resolves the fixed late-pickup Charge Template. Posts nothing.'::text,
        'late_pickup'::text, 'household'::text,
        '{"schema_version": 1, "amount_source": "fixed_template", "obligation_kind": "late_pickup"}'::jsonb
    ),
    (
        'attendance.drop_in'::text, 'Drop-In'::text, 'attendance'::text,
        'Drop-in attendance creates a drop-in consumption, priced at the drop-in rate rule via the drop-in Charge Template.'::text,
        'drop_in'::text, 'household'::text,
        '{"schema_version": 1, "amount_source": "rate_resolution", "obligation_kind": "drop_in"}'::jsonb
    ),
    (
        'attendance.extra_day'::text, 'Extra Day'::text, 'attendance'::text,
        'Attendance on a day outside the recurring schedule, priced at the drop-in rate.'::text,
        'drop_in'::text, 'household'::text,
        '{"schema_version": 1, "amount_source": "rate_resolution", "obligation_kind": "extra_day"}'::jsonb
    ),
    (
        'attendance.extended_day'::text, 'Extended Day'::text, 'attendance'::text,
        'Extended-day care beyond the standard day, billed at the drop-in rate.'::text,
        'drop_in'::text, 'household'::text,
        '{"schema_version": 1, "amount_source": "rate_resolution", "obligation_kind": "extended_day"}'::jsonb
    ),
    (
        'attendance.hourly_care'::text, 'Hourly Care'::text, 'attendance'::text,
        'Hourly care priced at the hourly rate rule times the hours of care via the hourly Charge Template.'::text,
        'hourly_care'::text, 'household'::text,
        '{"schema_version": 1, "amount_source": "rate_resolution_hourly", "obligation_kind": "hourly_care"}'::jsonb
    ),
    (
        'attendance.no_show'::text, 'No-Show'::text, 'attendance'::text,
        'A no-show. A fee applies only if the org configured a no-show Charge Template; otherwise the obligation is suppressed (explained).'::text,
        NULL::text, 'household'::text,
        '{"schema_version": 1, "amount_source": "fixed_template_optional", "obligation_kind": "no_show"}'::jsonb
    ),
    (
        'attendance.vacation_credit'::text, 'Vacation Credit'::text, 'attendance'::text,
        'An absence for a vacation-eligible child creates a vacation-credit consumption. Preview only — credits post downstream.'::text,
        NULL::text, 'household'::text,
        '{"schema_version": 1, "amount_source": "credit_preview", "obligation_kind": "vacation_credit"}'::jsonb
    )
) AS v(event_key, label, source_family, description, charge_template_key, default_responsibility_key, metadata)
WHERE NOT EXISTS (
    SELECT 1 FROM public.consumption_event_types cet
    WHERE cet.org_id IS NULL AND cet.event_key = v.event_key
);
