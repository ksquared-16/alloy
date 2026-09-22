-- P0-7.6 · STEP 2 — ONE MAINTAINED FACT FIELD, TWO FIRST-ORDER READS RETIRED
--
-- ── WHY THIS EXISTS ──
--
-- The evaluated Work Unit page costs THREE serial reads: the base records, then an Effective Process
-- Position enrichment, then an active-tour enrichment. The second and third exist only because facts
-- the evaluator needs live in other tables. They are not slow queries — they are serial round trips,
-- and the budget this programme spends is round trips, not milliseconds.
--
-- Both enrichments are already PURE derivations over RAW rows. So the rows move: the raw facts are
-- maintained on the opportunity at the moment they change, inside the transaction that changes them,
-- and the derivation stays exactly where it is and stays pure.
--
-- ── WHAT IS PERSISTED, AND WHAT IS DELIBERATELY NOT ──
--
-- Persisted: raw participant rows (identity, stage, state, close reason, stage entry, location) and
-- the raw active booking (id, status, start, timezone). Nothing derived.
--
-- NOT persisted, and this is the load-bearing half:
--   · the effective inherited stage — it depends on opportunities.stage_key, which can change without
--     any participant changing, so a stored copy would be wrong the moment a family moved;
--   · rollup labels — presentation, derived per request;
--   · allowedLocationIds results or any operator scope — an authorization ANSWER cached against a row
--     is a permission that outlives the permission. Scope stays request-time, applied purely to the
--     raw location_id below.
--
-- ONE column, not several: this is one fact set with one maintainer, and splitting it would invite a
-- second one.

ALTER TABLE public.opportunities
    ADD COLUMN IF NOT EXISTS maintained_operational_facts jsonb NOT NULL
    DEFAULT '{"v":1,"participants":[],"tour":null}'::jsonb;

COMMENT ON COLUMN public.opportunities.maintained_operational_facts IS
    'P0-7.6 Step 2. RAW participant and active-tour facts maintained transactionally by their owning '
    'authorities, so evaluated navigation needs no enrichment reads. Derivation (inheritance, rollup, '
    'scope filtering, wall dates) stays pure and request-time. Never holds derived or authorization data.';

-- ── THE RECOMPUTE HELPERS ──
--
-- Recompute, not incremental patch. A participant's stage change can alter which participants are
-- relevant, and an incremental edit would have to re-derive that anyway; recomputing from the source
-- rows inside the same transaction is both simpler and impossible to skew.

/**
 * A participant belongs to an opportunity under EITHER anchor: the older shape anchors the journey to
 * the opportunity itself, the current one anchors it to the Enrollment Participation row. Matching
 * only opportunity ids is exactly what stopped finding participation-anchored journeys before.
 *
 * Closed participants are INCLUDED. The reader filters them, purely — persisting the filter here
 * would move a derivation into storage and make "absent" and "closed" indistinguishable.
 */
CREATE OR REPLACE FUNCTION public.opportunity_participant_facts(p_org_id uuid, p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id',               pi.id,
                'subject_type',     pi.subject_type,
                'subject_id',       pi.subject_id,
                'context_id',       pi.context_id,
                'stage_key',        pi.stage_key,
                'state',            pi.state,
                'close_reason_key', pi.close_reason_key,
                'stage_entered_at', pi.stage_entered_at,
                'location_id',      NULLIF(btrim(COALESCE(pi.metadata ->> 'location_id', '')), '')
            )
            -- Deterministic order so the backfill and the maintainer agree byte for byte.
            ORDER BY pi.id
        ),
        '[]'::jsonb
    )
    FROM public.process_instances pi
    WHERE pi.org_id = p_org_id
      AND pi.process_key = 'enrollment'
      AND (
            pi.context_id = p_opportunity_id
            OR pi.context_id IN (
                SELECT m.id FROM public.opportunity_customer_members m
                 WHERE m.org_id = p_org_id AND m.opportunity_id = p_opportunity_id
            )
          );
$fn$;

/**
 * The soonest ACTIVE, non-terminal booking — the same rule the read it replaces applied when an
 * opportunity had more than one. Wall date and time are NOT stored: they derive purely from start_at
 * and timezone, and storing them would be a second copy to keep true.
 */
CREATE OR REPLACE FUNCTION public.opportunity_active_tour_facts(p_org_id uuid, p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
    SELECT COALESCE(
        (SELECT jsonb_build_object(
                    'booking_id', tb.id,
                    'status_key', tb.status_key,
                    'start_at',   tb.start_at,
                    'timezone',   tb.timezone
                )
           FROM public.tour_bookings tb
          WHERE tb.org_id = p_org_id
            AND tb.opportunity_id = p_opportunity_id
            AND tb.status_key IN ('requested', 'pending_approval', 'confirmed', 'rescheduled')
          ORDER BY tb.start_at ASC, tb.id ASC
          LIMIT 1),
        'null'::jsonb
    );
$fn$;

/** The opportunity behind a participation, under either anchor. NULL for a context-free journey. */
CREATE OR REPLACE FUNCTION public.opportunity_for_participation(p_org_id uuid, p_participation_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
    SELECT CASE
        WHEN pi.context_id IS NULL THEN NULL
        WHEN EXISTS (SELECT 1 FROM public.opportunities o
                      WHERE o.id = pi.context_id AND o.org_id = p_org_id) THEN pi.context_id
        ELSE (SELECT m.opportunity_id FROM public.opportunity_customer_members m
               WHERE m.id = pi.context_id AND m.org_id = p_org_id)
    END
    FROM public.process_instances pi
    WHERE pi.id = p_participation_id AND pi.org_id = p_org_id;
$fn$;

/**
 * THE ONE MAINTAINER. Every authority calls this rather than composing the jsonb itself, so the shape
 * has a single definition and a second writer cannot invent a different one.
 */
CREATE OR REPLACE FUNCTION public.refresh_opportunity_maintained_facts(p_org_id uuid, p_opportunity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
    IF p_opportunity_id IS NULL THEN RETURN; END IF;
    UPDATE public.opportunities
       SET maintained_operational_facts = jsonb_build_object(
               'v', 1,
               'participants', public.opportunity_participant_facts(p_org_id, p_opportunity_id),
               'tour',         public.opportunity_active_tour_facts(p_org_id, p_opportunity_id)
           )
     WHERE id = p_opportunity_id AND org_id = p_org_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.opportunity_participant_facts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opportunity_active_tour_facts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opportunity_for_participation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_opportunity_maintained_facts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.opportunity_participant_facts(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.opportunity_active_tour_facts(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.opportunity_for_participation(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_opportunity_maintained_facts(uuid, uuid) TO authenticated, service_role;

-- ── THE SEAM, FILLED ──
--
-- Same signature, so this REPLACES the certified function rather than sitting beside it. Every
-- converged post-creation lifecycle path — the two *ByScope writers, the two primitives, and
-- materialization, which delegates here — inherits the maintained-fact update with no second writer
-- and nothing to remember. A plpgsql body is one transaction: the participation UPDATE and the
-- opportunity UPDATE commit together or not at all.

CREATE OR REPLACE FUNCTION public.update_participation_and_maintain_facts(
    p_org_id uuid,
    p_participation_id uuid,
    p_expected_version timestamptz DEFAULT NULL,
    p_set_stage_key boolean DEFAULT false,
    p_stage_key text DEFAULT NULL,
    p_set_state boolean DEFAULT false,
    p_state text DEFAULT NULL,
    p_set_close_reason_key boolean DEFAULT false,
    p_close_reason_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_now timestamptz := now();
    v_hit integer;
    v_opp uuid;
BEGIN
    UPDATE public.process_instances
       SET stage_key        = CASE WHEN p_set_stage_key       THEN p_stage_key        ELSE stage_key        END,
           state            = CASE WHEN p_set_state           THEN p_state            ELSE state            END,
           close_reason_key = CASE WHEN p_set_close_reason_key THEN p_close_reason_key ELSE close_reason_key END,
           stage_entered_at = CASE WHEN p_set_stage_key       THEN v_now              ELSE stage_entered_at END,
           updated_at       = v_now
     WHERE id = p_participation_id
       AND org_id = p_org_id
       AND (p_expected_version IS NULL OR updated_at = p_expected_version);

    GET DIAGNOSTICS v_hit = ROW_COUNT;

    IF v_hit = 0 THEN
        -- Refused: nothing was written, so nothing is maintained. A stale or cross-org attempt must
        -- leave the participation AND the maintained facts exactly as they were.
        RETURN jsonb_build_object('ok', false, 'error', 'record_not_found_or_stale', 'code', 'stale');
    END IF;

    -- ── STEP 2, HERE ──
    v_opp := public.opportunity_for_participation(p_org_id, p_participation_id);
    PERFORM public.refresh_opportunity_maintained_facts(p_org_id, v_opp);

    RETURN jsonb_build_object('ok', true);
END;
$fn$;

-- ── CREATION INITIALIZES, IT DOES NOT REPAIR ──
--
-- Creation is deliberately not a Processing Identity lifecycle command, so it does not pass through
-- the authority above. It still has to leave maintained truth correct, and a post-create UPDATE would
-- be exactly the second lifecycle writer this programme spent a slice removing.
--
-- So the INSERT and the initialization are one transaction. TypeScript keeps its reuse and race
-- decisions and hands the built row here; this function does not invent one.

CREATE OR REPLACE FUNCTION public.insert_enrollment_participation_and_maintain_facts(
    p_org_id uuid,
    p_row jsonb,
    p_ignore_duplicates boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_new public.process_instances%ROWTYPE;
    v_id  uuid;
    v_opp uuid;
BEGIN
    v_new := jsonb_populate_record(NULL::public.process_instances, p_row);

    /*
     * ── WHY THE DEFAULTS ARE APPLIED BY HAND ──
     *
     * `jsonb_populate_record` fills every column the jsonb does not mention with NULL, and
     * `INSERT ... VALUES (v_new.*)` then inserts those NULLs EXPLICITLY — which overrides the column
     * defaults rather than falling back to them. The caller's row legitimately omits id, metadata and
     * created_at because the table generates them, so without this the insert fails on
     * `null value in column "id" ... violates not-null constraint`.
     *
     * These are exactly the NOT NULL columns of `process_instances` that carry a DEFAULT. Nullable
     * columns (updated_at, stage_entered_at, business_process_revision_id) are left alone: NULL is a
     * legitimate value for each, and coalescing them would invent facts the caller did not state.
     */
    v_new.id         := COALESCE(v_new.id, gen_random_uuid());
    v_new.metadata   := COALESCE(v_new.metadata, '{}'::jsonb);
    v_new.created_at := COALESCE(v_new.created_at, now());

    IF v_new.org_id IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'insert_enrollment_participation: row org % does not match caller org %', v_new.org_id, p_org_id;
    END IF;

    IF p_ignore_duplicates THEN
        INSERT INTO public.process_instances AS t VALUES (v_new.*)
        ON CONFLICT (org_id, process_key, subject_id, context_id) DO NOTHING
        RETURNING t.id INTO v_id;
    ELSE
        INSERT INTO public.process_instances AS t VALUES (v_new.*)
        RETURNING t.id INTO v_id;
    END IF;

    IF v_id IS NULL THEN
        -- A conflict under ignoreDuplicates returns no row. That is not a failure — the journey this
        -- call asked for already exists — and its facts are already maintained.
        RETURN jsonb_build_object('ok', true, 'id', NULL, 'conflict', true);
    END IF;

    v_opp := public.opportunity_for_participation(p_org_id, v_id);
    PERFORM public.refresh_opportunity_maintained_facts(p_org_id, v_opp);

    RETURN jsonb_build_object('ok', true, 'id', v_id, 'conflict', false);
END;
$fn$;

-- ── TOUR TRUTH, AT ITS EXISTING AUTHORITY ──
--
-- The tour integration owns booking-driven opportunity truth today and keeps owning it; this is the
-- one call it gains. It is separate from the lifecycle authority because a booking is not a
-- participation, and forcing them together would widen the lifecycle contract to a domain it has no
-- business knowing.
--
-- Cancellation matters specifically: applyTourBookingOpportunityIntegration returns EARLY for a
-- cancel, before the metadata mirror, so a cancel that relied on the mirror would leave a cancelled
-- tour looking active forever. The cancel branch calls this directly.

CREATE OR REPLACE FUNCTION public.maintain_opportunity_tour_facts(p_org_id uuid, p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE v_hit integer;
BEGIN
    UPDATE public.opportunities
       SET maintained_operational_facts = jsonb_set(
               CASE
                   WHEN jsonb_typeof(maintained_operational_facts) = 'object'
                       THEN maintained_operational_facts
                   ELSE '{"v":1,"participants":[]}'::jsonb
               END,
               '{tour}',
               public.opportunity_active_tour_facts(p_org_id, p_opportunity_id)
           )
     WHERE id = p_opportunity_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_hit = ROW_COUNT;
    IF v_hit = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'record_not_found_or_stale', 'code', 'stale');
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.insert_enrollment_participation_and_maintain_facts(uuid, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maintain_opportunity_tour_facts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_enrollment_participation_and_maintain_facts(uuid, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.maintain_opportunity_tour_facts(uuid, uuid) TO authenticated, service_role;

-- ── BACKFILL ──
--
-- Deterministic and idempotent: it recomputes from the same source rows the maintainer uses, so
-- running it twice produces the same bytes and running it after maintenance changes nothing. No
-- fabricated defaults — an opportunity with no participants and no booking gets an empty set, which
-- is a true answer and NOT the same as "never maintained".
--
-- Every opportunity is covered here so navigation never has to repair anything it finds missing.
UPDATE public.opportunities o
   SET maintained_operational_facts = jsonb_build_object(
           'v', 1,
           'participants', public.opportunity_participant_facts(o.org_id, o.id),
           'tour',         public.opportunity_active_tour_facts(o.org_id, o.id)
       );

-- ── THE MAINTAINED COLUMN IS MECHANICAL, LIKE metadata ──
--
-- `set_updated_at_opportunities` stamps `updated_at = now()` whenever anything OTHER than `metadata`
-- changes, and deliberately preserves it for metadata-only patches so mechanical writes do not erase
-- timestamps the queues depend on.
--
-- Maintained facts are that same class of write, and they now change on every participation lifecycle
-- move. Without this, a child changing stage would restamp its FAMILY's `updated_at` — and
-- `QueueService` both sorts and filters opportunities on that column, so operator queues would quietly
-- reorder themselves every time an unrelated child moved. The rows would all still be correct, which
-- is why nothing would fail.
--
-- So the column joins `metadata` in the existing rule rather than getting a rule of its own. An
-- operator edit alongside a maintained change still stamps, exactly as it does today.

CREATE OR REPLACE FUNCTION public.set_updated_at_opportunities()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
    new_wo jsonb;
    old_wo jsonb;
BEGIN
    new_wo := to_jsonb(NEW) - 'metadata' - 'updated_at' - 'maintained_operational_facts';
    old_wo := to_jsonb(OLD) - 'metadata' - 'updated_at' - 'maintained_operational_facts';

    IF (NEW.metadata IS DISTINCT FROM OLD.metadata
        OR NEW.maintained_operational_facts IS DISTINCT FROM OLD.maintained_operational_facts)
       AND new_wo IS NOT DISTINCT FROM old_wo THEN
        NEW.updated_at := OLD.updated_at;
        RETURN NEW;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$fn$;

-- ── EXECUTION PROOF ─────────────────────────────────────────────────────────────────────────────
-- SQL text is not evidence. Every assertion is NULL-safe, the stale specimen CONSTRUCTS a
-- guaranteed-different version (now() is transaction-stable, so a captured one would be EQUAL and the
-- guard would ACCEPT it), and the rollback specimen proves BOTH sides landed before aborting.
DO $selftest$
DECLARE
    v_org   uuid;
    v_org2  uuid;
    v_cust  uuid;
    v_cm    uuid;
    v_loc   uuid;
    v_opp   uuid;
    v_opp2  uuid;
    v_ocm   uuid;
    v_pi    uuid;
    v_pi2   uuid;
    v_res   jsonb;
    v_facts jsonb;
    v_again jsonb;
    v_current timestamptz;
    v_stale   timestamptz;
    v_tour  uuid;
    v_opp_stamp timestamptz;
BEGIN
    INSERT INTO public.orgs (name, slug) VALUES ('__selftest_step2__', '__selftest_' || gen_random_uuid()) RETURNING id INTO v_org;
    INSERT INTO public.orgs (name, slug) VALUES ('__selftest_step2_other__', '__selftest_' || gen_random_uuid()) RETURNING id INTO v_org2;
    INSERT INTO public.customers (org_id, name) VALUES (v_org, 'Selftest Family') RETURNING id INTO v_cust;
    INSERT INTO public.customer_members (org_id, customer_id, display_name) VALUES (v_org, v_cust, 'Selftest Child') RETURNING id INTO v_cm;
    -- locations has no name column; label is optional and every other column defaults.
    INSERT INTO public.locations (org_id, label) VALUES (v_org, 'Selftest Site') RETURNING id INTO v_loc;
    INSERT INTO public.opportunities (org_id, stage_key) VALUES (v_org, 'lead') RETURNING id INTO v_opp;
    INSERT INTO public.opportunities (org_id, stage_key) VALUES (v_org, 'lead') RETURNING id INTO v_opp2;
    INSERT INTO public.opportunity_customer_members (org_id, opportunity_id, customer_member_id)
        VALUES (v_org, v_opp, v_cm) RETURNING id INTO v_ocm;

    -- 1 · ABSENCE IS NOT MISSING. A brand-new opportunity is MAINTAINED and EMPTY, and says so.
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF v_facts IS NULL THEN RAISE EXCEPTION 'SELFTEST: maintained facts are NULL on a new opportunity'; END IF;
    IF (v_facts -> 'participants') IS DISTINCT FROM '[]'::jsonb THEN
        RAISE EXCEPTION 'SELFTEST: a new opportunity did not start with an empty participant set (%)', v_facts;
    END IF;
    IF (v_facts -> 'tour') IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'SELFTEST: a new opportunity did not start with a null tour (%)', v_facts;
    END IF;

    -- 2 · CREATION INITIALIZES, in the same transaction as the INSERT — never a repair UPDATE.
    v_res := public.insert_enrollment_participation_and_maintain_facts(
        v_org,
        jsonb_build_object(
            'org_id', v_org, 'process_key', 'enrollment', 'subject_type', 'child',
            'subject_id', v_cm, 'context_type', 'opportunity', 'context_id', v_opp,
            'stage_key', NULL, 'state', 'active',
            'metadata', jsonb_build_object('location_id', v_loc::text)
        ));
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: creation refused: %', v_res; END IF;
    v_pi := (v_res ->> 'id')::uuid;
    IF v_pi IS NULL THEN RAISE EXCEPTION 'SELFTEST: creation returned no id: %', v_res; END IF;
    -- The caller's row omits id / metadata / created_at because the table generates them. A
    -- composite INSERT passes the populated NULLs through EXPLICITLY and overrides those defaults,
    -- so generation is asserted rather than assumed.
    IF NOT EXISTS (
        SELECT 1 FROM public.process_instances
         WHERE id = v_pi AND metadata IS NOT NULL AND created_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'SELFTEST: creation did not generate the defaulted columns for %', v_pi;
    END IF;

    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF jsonb_array_length(v_facts -> 'participants') <> 1 THEN
        RAISE EXCEPTION 'SELFTEST: creation did not initialize maintained truth (%)', v_facts;
    END IF;
    IF (v_facts -> 'participants' -> 0 ->> 'id') IS DISTINCT FROM v_pi::text THEN
        RAISE EXCEPTION 'SELFTEST: maintained participant is not the created one (%)', v_facts;
    END IF;
    -- The RAW location rides along; the SCOPE DECISION never does.
    IF (v_facts -> 'participants' -> 0 ->> 'location_id') IS DISTINCT FROM v_loc::text THEN
        RAISE EXCEPTION 'SELFTEST: raw participant location was not maintained (%)', v_facts;
    END IF;

    -- 3 · NOTHING DERIVED IS PERSISTED. Inheritance, rollup and scope stay pure by construction: the
    --     stored object may carry ONLY these keys, so a future "just cache the effective stage" fails.
    IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_facts -> 'participants' -> 0) AS k
         WHERE k NOT IN ('id','subject_type','subject_id','context_id','stage_key','state',
                         'close_reason_key','stage_entered_at','location_id')
    ) THEN
        RAISE EXCEPTION 'SELFTEST: a non-raw key was persisted on a participant (%)', v_facts;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_facts) AS k WHERE k NOT IN ('v','participants','tour')) THEN
        RAISE EXCEPTION 'SELFTEST: an unexpected top-level key was persisted (%)', v_facts;
    END IF;

    -- 3b · MAINTENANCE DOES NOT RESTAMP THE FAMILY. QueueService sorts and filters opportunities on
    --      updated_at, so a child moving stage must not reorder its family in every operator queue.
    UPDATE public.opportunities SET updated_at = '2026-01-01T00:00:00Z' WHERE id = v_opp;
    SELECT updated_at INTO v_opp_stamp FROM public.opportunities WHERE id = v_opp;

    -- 4 · POST-CREATION LIFECYCLE MAINTENANCE, through the one authority.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, true, 'tour', false, NULL);
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: lifecycle update refused: %', v_res; END IF;
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF (v_facts -> 'participants' -> 0 ->> 'stage_key') IS DISTINCT FROM 'tour' THEN
        RAISE EXCEPTION 'SELFTEST: lifecycle mutation did not maintain the opportunity fact (%)', v_facts;
    END IF;
    IF (SELECT updated_at FROM public.opportunities WHERE id = v_opp) IS DISTINCT FROM v_opp_stamp THEN
        RAISE EXCEPTION 'SELFTEST: maintenance restamped the family updated_at — operator queues would reorder';
    END IF;

    -- 5 · THE SECOND ANCHOR. A journey anchored to the Enrollment Participation still belongs to the
    --     opportunity; matching opportunity ids alone is exactly what lost these before.
    v_res := public.insert_enrollment_participation_and_maintain_facts(
        v_org,
        jsonb_build_object(
            'org_id', v_org, 'process_key', 'enrollment', 'subject_type', 'child',
            'subject_id', v_cm, 'context_type', 'enrollment_participation', 'context_id', v_ocm,
            'stage_key', 'waitlist', 'state', 'active', 'metadata', '{}'::jsonb
        ));
    v_pi2 := (v_res ->> 'id')::uuid;
    IF v_pi2 IS NULL THEN RAISE EXCEPTION 'SELFTEST: participation-anchored creation failed: %', v_res; END IF;
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF jsonb_array_length(v_facts -> 'participants') <> 2 THEN
        RAISE EXCEPTION 'SELFTEST: the participation-anchored journey was not rolled up (%)', v_facts;
    END IF;

    -- 6 · A CLOSED PARTICIPANT IS STILL PERSISTED RAW. The reader filters; storage does not decide.
    v_res := public.update_participation_and_maintain_facts(
        v_org, v_pi2, NULL, false, NULL, true, 'closed', true, 'withdrawn');
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: close refused: %', v_res; END IF;
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF jsonb_array_length(v_facts -> 'participants') <> 2 THEN
        RAISE EXCEPTION 'SELFTEST: a closed participant was dropped from storage — absent and closed must differ (%)', v_facts;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_facts -> 'participants') AS p
         WHERE p ->> 'close_reason_key' = 'withdrawn') THEN
        RAISE EXCEPTION 'SELFTEST: the close reason was not maintained raw (%)', v_facts;
    END IF;

    -- 7 · BACKFILL IS DETERMINISTIC AND IDEMPOTENT: recomputing changes nothing.
    PERFORM public.refresh_opportunity_maintained_facts(v_org, v_opp);
    SELECT maintained_operational_facts INTO v_again FROM public.opportunities WHERE id = v_opp;
    IF v_again IS DISTINCT FROM v_facts THEN
        RAISE EXCEPTION 'SELFTEST: recompute is not idempotent — % vs %', v_facts, v_again;
    END IF;

    -- 8 · STALE VERSION leaves the participation AND the maintained facts untouched.
    SELECT updated_at INTO v_current FROM public.process_instances WHERE id = v_pi;
    IF v_current IS NULL THEN RAISE EXCEPTION 'SELFTEST: no current version to build a stale one from'; END IF;
    v_stale := v_current - interval '1 second';
    IF v_stale IS NOT DISTINCT FROM v_current THEN RAISE EXCEPTION 'SELFTEST: constructed version is not distinct'; END IF;
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, v_stale, true, 'leaked', false, NULL);
    IF (v_res ->> 'code') IS DISTINCT FROM 'stale' THEN RAISE EXCEPTION 'SELFTEST: stale write accepted: %', v_res; END IF;
    SELECT maintained_operational_facts INTO v_again FROM public.opportunities WHERE id = v_opp;
    IF v_again IS DISTINCT FROM v_facts THEN
        RAISE EXCEPTION 'SELFTEST: a REFUSED write still moved the maintained facts (%)', v_again;
    END IF;

    -- 9 · CROSS-ORG refusal leaves both sides untouched.
    v_res := public.update_participation_and_maintain_facts(v_org2, v_pi, NULL, true, 'leaked', false, NULL);
    IF (v_res ->> 'ok') IS NOT DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: cross-org write succeeded: %', v_res; END IF;
    SELECT maintained_operational_facts INTO v_again FROM public.opportunities WHERE id = v_opp;
    IF v_again IS DISTINCT FROM v_facts THEN
        RAISE EXCEPTION 'SELFTEST: a cross-org attempt moved the maintained facts (%)', v_again;
    END IF;

    -- 10 · TOUR: schedule → reschedule → cancel → complete, each at the maintaining authority.
    INSERT INTO public.tour_bookings (org_id, opportunity_id, location_id, start_at, end_at, timezone, status_key, source)
    -- chk_tour_bookings_source allows admin|public_link|form_submission|automation only; a
    -- descriptive value like 'selftest' is refused, and chk_tour_bookings_time_window needs end > start.
    VALUES (v_org, v_opp, v_loc, '2026-10-01T15:00:00Z', '2026-10-01T16:00:00Z', 'UTC', 'confirmed', 'admin')
    RETURNING id INTO v_tour;
    PERFORM public.maintain_opportunity_tour_facts(v_org, v_opp);
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF (v_facts -> 'tour' ->> 'booking_id') IS DISTINCT FROM v_tour::text THEN
        RAISE EXCEPTION 'SELFTEST: a scheduled tour was not maintained (%)', v_facts;
    END IF;
    IF (v_facts -> 'tour' ->> 'timezone') IS DISTINCT FROM 'UTC' THEN
        RAISE EXCEPTION 'SELFTEST: raw tour timezone was not maintained (%)', v_facts;
    END IF;
    -- Wall date/time are DERIVED and must never be stored.
    IF (v_facts -> 'tour') ?| ARRAY['tour_date', 'tour_time', 'has_active_tour'] THEN
        RAISE EXCEPTION 'SELFTEST: a derived tour value was persisted (%)', v_facts;
    END IF;

    -- end_at moves WITH start_at: chk_tour_bookings_time_window requires end_at > start_at, and a
    -- reschedule that moved only the start pushed the booking past its own end.
    UPDATE public.tour_bookings
       SET start_at = '2026-10-02T15:00:00Z', end_at = '2026-10-02T16:00:00Z', status_key = 'rescheduled'
     WHERE id = v_tour;
    PERFORM public.maintain_opportunity_tour_facts(v_org, v_opp);
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF (v_facts -> 'tour' ->> 'start_at') IS NULL OR (v_facts -> 'tour' ->> 'status_key') IS DISTINCT FROM 'rescheduled' THEN
        RAISE EXCEPTION 'SELFTEST: a reschedule was not maintained (%)', v_facts;
    END IF;

    -- CANCEL is the one that returns early from the integration, so it must clear truth explicitly.
    UPDATE public.tour_bookings SET status_key = 'canceled' WHERE id = v_tour;
    PERFORM public.maintain_opportunity_tour_facts(v_org, v_opp);
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF (v_facts -> 'tour') IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'SELFTEST: a CANCELLED tour is still maintained as active (%)', v_facts;
    END IF;

    UPDATE public.tour_bookings SET status_key = 'completed' WHERE id = v_tour;
    PERFORM public.maintain_opportunity_tour_facts(v_org, v_opp);
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF (v_facts -> 'tour') IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'SELFTEST: a COMPLETED tour is still maintained as active (%)', v_facts;
    END IF;

    -- no_show is the fourth terminal status and the one with no specimen of its own until now. It
    -- clears through the SAME recompute as completed — it is simply absent from the active set — but
    -- "covered by the same code path" is an argument, not evidence, and the whole point of this block
    -- is that arguments are not proof.
    UPDATE public.tour_bookings SET status_key = 'no_show' WHERE id = v_tour;
    PERFORM public.maintain_opportunity_tour_facts(v_org, v_opp);
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF (v_facts -> 'tour') IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'SELFTEST: a NO_SHOW tour is still maintained as active (%)', v_facts;
    END IF;

    -- And the active set really does admit an active booking again, so the four terminal specimens
    -- above are not passing merely because the recompute always returns null.
    UPDATE public.tour_bookings SET status_key = 'confirmed' WHERE id = v_tour;
    PERFORM public.maintain_opportunity_tour_facts(v_org, v_opp);
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    IF (v_facts -> 'tour' ->> 'booking_id') IS DISTINCT FROM v_tour::text THEN
        RAISE EXCEPTION 'SELFTEST: the tour recompute never returns an active booking — the terminal specimens prove nothing (%)', v_facts;
    END IF;
    UPDATE public.tour_bookings SET status_key = 'no_show' WHERE id = v_tour;
    PERFORM public.maintain_opportunity_tour_facts(v_org, v_opp);
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    -- Maintaining the tour must not disturb the participants half.
    IF jsonb_array_length(v_facts -> 'participants') <> 2 THEN
        RAISE EXCEPTION 'SELFTEST: tour maintenance clobbered the participant set (%)', v_facts;
    END IF;

    -- 11 · THE LOAD-BEARING SPECIMEN — a failure after BOTH sides have mutated rolls BOTH back.
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp;
    BEGIN
        v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, true, 'rolled_back_stage', false, NULL);
        IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: rollback setup refused: %', v_res; END IF;
        -- BOTH halves must be proven to have landed, or "unchanged after rollback" would also pass if
        -- neither had ever been written.
        IF (SELECT stage_key FROM public.process_instances WHERE id = v_pi) IS DISTINCT FROM 'rolled_back_stage' THEN
            RAISE EXCEPTION 'SELFTEST: rollback setup did not move the participation';
        END IF;
        SELECT maintained_operational_facts INTO v_again FROM public.opportunities WHERE id = v_opp;
        IF v_again IS NOT DISTINCT FROM v_facts THEN
            RAISE EXCEPTION 'SELFTEST: rollback setup did not move the maintained facts — the specimen would prove nothing';
        END IF;
        RAISE EXCEPTION 'SELFTEST_FORCED_ROLLBACK';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM IS DISTINCT FROM 'SELFTEST_FORCED_ROLLBACK' THEN RAISE; END IF;
    END;
    IF (SELECT stage_key FROM public.process_instances WHERE id = v_pi) IS DISTINCT FROM 'tour' THEN
        RAISE EXCEPTION 'SELFTEST: the participation survived a rolled-back transaction — split commit is possible';
    END IF;
    SELECT maintained_operational_facts INTO v_again FROM public.opportunities WHERE id = v_opp;
    IF v_again IS DISTINCT FROM v_facts THEN
        RAISE EXCEPTION 'SELFTEST: the maintained fact survived a rolled-back transaction — split commit is possible (%)', v_again;
    END IF;

    -- 12 · AN OPPORTUNITY WITH NO PARTICIPANTS AND NO TOUR stays empty, not absent.
    SELECT maintained_operational_facts INTO v_facts FROM public.opportunities WHERE id = v_opp2;
    IF (v_facts -> 'participants') IS DISTINCT FROM '[]'::jsonb OR (v_facts -> 'tour') IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'SELFTEST: an untouched opportunity is not maintained-empty (%)', v_facts;
    END IF;

    RAISE EXCEPTION 'SELFTEST_CLEANUP';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'SELFTEST_CLEANUP' THEN RAISE; END IF;
END
$selftest$;
