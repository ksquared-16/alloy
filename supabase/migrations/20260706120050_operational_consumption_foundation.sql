-- =============================================================================
-- Operational Consumption — foundation (Slice 1)
-- =============================================================================
-- Operational Consumption is the RUNTIME layer between Operational Execution and
-- Commercial / Financial Resolution. It answers ONE question:
--
--     Given an operational fact, what commercial meaning should exist?
--
-- It does NOT post money, create invoices/payments/statements, touch the ledger,
-- or mutate authoritative financial truth. It interprets facts into draft
-- intent: a Consumption Event, zero-or-more Resolved Obligations, and (only when
-- explicitly asked) idempotent DRAFT charges resolved through the EXISTING
-- Commercial Model / Charge Template resolver. Posting remains the only
-- authoritative money write and is out of scope here.
--
-- Doctrine: docs/platform/modules/operational-consumption-platform.md
--           docs/platform/operational-truth-flow-doctrine.md
--   Operational Truth -> Operational Execution -> Operational Consumption ->
--   Commercial Model -> Financial Resolution -> Draft Charges -> Posting.
--
-- Three additive tables:
--   * consumption_event_types  — registry: which operational facts carry commercial
--                                meaning, and which Charge Template (by key) they
--                                resolve. Global (org_id NULL) templates + org copies.
--   * consumption_events        — a normalized operational fact, recorded as the
--                                canonical runtime contract (NOT a charge).
--   * resolved_obligations      — the commercial meaning a consumption event resolves
--                                to: a draft obligation preview, optionally linked to
--                                a DRAFT charge. Never authoritative; recomputable.
--
-- ADDITIVE ONLY. No changes to charges / financial_* / workflow_events. RLS, org
-- isolation, timestamps, updated_at triggers. No posting, no money writes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- consumption_event_types — registry of consumable operational facts.
-- Global templates have org_id NULL (mirrors metric_definitions); an org may
-- later override with its own row. `charge_template_key` names the Commercial
-- Model Charge Template this event resolves (resolved per-org at runtime by key);
-- NULL means the event produces no charge (a valid outcome).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consumption_event_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    event_key text NOT NULL,
    label text NOT NULL,
    source_family text NOT NULL,
    description text,
    -- Commercial Model linkage by KEY (not FK): the org's Charge Template with this
    -- template_key is resolved at runtime. NULL => event produces no charge.
    charge_template_key text,
    default_responsibility_key text,
    is_active boolean NOT NULL DEFAULT true,
    effective_start date NOT NULL DEFAULT '2000-01-01',
    effective_end date,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT consumption_event_types_key_nonempty CHECK (char_length(btrim(event_key)) > 0),
    CONSTRAINT consumption_event_types_label_nonempty CHECK (char_length(btrim(label)) > 0),
    CONSTRAINT consumption_event_types_family_nonempty CHECK (char_length(btrim(source_family)) > 0),
    CONSTRAINT consumption_event_types_end_after_start
        CHECK (effective_end IS NULL OR effective_end >= effective_start)
);

COMMENT ON TABLE public.consumption_event_types IS
    'Operational Consumption registry: which operational facts carry commercial meaning and the Charge Template (by key) they resolve. Global templates have org_id NULL; org rows override. Runtime interpretation only — posts nothing.';
COMMENT ON COLUMN public.consumption_event_types.charge_template_key IS
    'Commercial Model Charge Template key this event resolves (resolved per-org at runtime). NULL => the event produces no charge.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_consumption_event_types_org_key
    ON public.consumption_event_types (org_id, event_key) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_consumption_event_types_global_key
    ON public.consumption_event_types (event_key) WHERE org_id IS NULL;

DROP TRIGGER IF EXISTS trg_consumption_event_types_updated_at ON public.consumption_event_types;
CREATE TRIGGER trg_consumption_event_types_updated_at
    BEFORE UPDATE ON public.consumption_event_types
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.consumption_event_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consumption_event_types_select_authenticated ON public.consumption_event_types;
CREATE POLICY consumption_event_types_select_authenticated ON public.consumption_event_types
    FOR SELECT TO authenticated
    USING (org_id IS NULL OR public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS consumption_event_types_insert_org ON public.consumption_event_types;
CREATE POLICY consumption_event_types_insert_org ON public.consumption_event_types
    FOR INSERT TO authenticated
    WITH CHECK (org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS consumption_event_types_update_org ON public.consumption_event_types;
CREATE POLICY consumption_event_types_update_org ON public.consumption_event_types
    FOR UPDATE TO authenticated
    USING (org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
    WITH CHECK (org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS consumption_event_types_all_service_role ON public.consumption_event_types;
CREATE POLICY consumption_event_types_all_service_role ON public.consumption_event_types
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON TABLE public.consumption_event_types TO authenticated;
GRANT ALL ON TABLE public.consumption_event_types TO service_role;

-- -----------------------------------------------------------------------------
-- consumption_events — a normalized operational fact, recorded as the canonical
-- runtime contract. NOT a charge. Some events produce no obligation, some one,
-- and some may later fan out into many. Idempotent per (org_id, idempotency_key).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consumption_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
    event_type_id uuid REFERENCES public.consumption_event_types (id) ON DELETE SET NULL,
    source_family text NOT NULL,
    event_key text NOT NULL,
    source_entity_type text NOT NULL,
    source_entity_id uuid NOT NULL,
    subject_type text,
    subject_id uuid,
    occurs_on date NOT NULL,
    effective_on date,
    status text NOT NULL DEFAULT 'recorded',
    context jsonb NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key text NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT consumption_events_event_key_nonempty CHECK (char_length(btrim(event_key)) > 0),
    CONSTRAINT consumption_events_family_nonempty CHECK (char_length(btrim(source_family)) > 0),
    CONSTRAINT consumption_events_idempotency_nonempty CHECK (char_length(btrim(idempotency_key)) > 0),
    CONSTRAINT consumption_events_status_check
        CHECK (status = ANY (ARRAY['recorded'::text, 'resolved'::text, 'no_obligation'::text, 'superseded'::text]))
);

COMMENT ON TABLE public.consumption_events IS
    'Operational Consumption runtime contract: a normalized operational fact recorded for commercial interpretation. NOT a charge; posts nothing. Idempotent per (org_id, idempotency_key). Replaces ad-hoc "charge events" as the canonical runtime contract; the trigger fact still lives in workflow_events.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_consumption_events_org_idempotency
    ON public.consumption_events (org_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_consumption_events_org_event_key
    ON public.consumption_events (org_id, event_key);
CREATE INDEX IF NOT EXISTS idx_consumption_events_source
    ON public.consumption_events (org_id, source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_consumption_events_org_location
    ON public.consumption_events (org_id, location_id) WHERE location_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_consumption_events_updated_at ON public.consumption_events;
CREATE TRIGGER trg_consumption_events_updated_at
    BEFORE UPDATE ON public.consumption_events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.consumption_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consumption_events_select_org ON public.consumption_events;
CREATE POLICY consumption_events_select_org ON public.consumption_events FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS consumption_events_insert_org ON public.consumption_events;
CREATE POLICY consumption_events_insert_org ON public.consumption_events FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS consumption_events_update_org ON public.consumption_events;
CREATE POLICY consumption_events_update_org ON public.consumption_events FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS consumption_events_all_service_role ON public.consumption_events;
CREATE POLICY consumption_events_all_service_role ON public.consumption_events FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON TABLE public.consumption_events TO authenticated;
GRANT ALL ON TABLE public.consumption_events TO service_role;

-- -----------------------------------------------------------------------------
-- resolved_obligations — the commercial meaning a consumption event resolves to.
-- A draft obligation preview, optionally linked to a DRAFT charge (charges row,
-- status='draft'). Never authoritative; recomputable. Idempotent per
-- (org_id, resolution_key). Posting (separate) is the only authoritative write.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resolved_obligations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
    consumption_event_id uuid NOT NULL REFERENCES public.consumption_events (id) ON DELETE CASCADE,
    charge_template_id uuid REFERENCES public.financial_charge_templates (id) ON DELETE SET NULL,
    service_id uuid REFERENCES public.financial_services (id) ON DELETE SET NULL,
    amount_cents bigint,
    currency_code text NOT NULL DEFAULT 'USD',
    responsibility_key text,
    occurs_on date,
    billable_on date,
    status text NOT NULL DEFAULT 'previewed',
    review_required boolean NOT NULL DEFAULT false,
    explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- A DRAFT charge (public.charges, status='draft') if one was written. Never a posted charge.
    draft_charge_id uuid REFERENCES public.charges (id) ON DELETE SET NULL,
    resolution_key text,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resolved_obligations_amount_nonneg CHECK (amount_cents IS NULL OR amount_cents >= 0),
    CONSTRAINT resolved_obligations_status_check
        CHECK (status = ANY (ARRAY['previewed'::text, 'drafted'::text, 'no_charge'::text, 'superseded'::text]))
);

COMMENT ON TABLE public.resolved_obligations IS
    'Operational Consumption output: the commercial meaning a consumption event resolves to (a draft obligation preview), optionally linked to a DRAFT charge. Non-authoritative and recomputable; writes no ledger/invoice/payment. Posting is the only authoritative money write and is out of scope.';
COMMENT ON COLUMN public.resolved_obligations.draft_charge_id IS
    'Linked DRAFT charge (public.charges, status=draft) if a draft was written. NULL for preview-only or no-charge obligations. Never references a posted charge.';

CREATE INDEX IF NOT EXISTS idx_resolved_obligations_event
    ON public.resolved_obligations (consumption_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_resolved_obligations_org_resolution
    ON public.resolved_obligations (org_id, resolution_key) WHERE resolution_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resolved_obligations_org_status
    ON public.resolved_obligations (org_id, status);
CREATE INDEX IF NOT EXISTS idx_resolved_obligations_draft_charge
    ON public.resolved_obligations (draft_charge_id) WHERE draft_charge_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_resolved_obligations_updated_at ON public.resolved_obligations;
CREATE TRIGGER trg_resolved_obligations_updated_at
    BEFORE UPDATE ON public.resolved_obligations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.resolved_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resolved_obligations_select_org ON public.resolved_obligations;
CREATE POLICY resolved_obligations_select_org ON public.resolved_obligations FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS resolved_obligations_insert_org ON public.resolved_obligations;
CREATE POLICY resolved_obligations_insert_org ON public.resolved_obligations FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS resolved_obligations_update_org ON public.resolved_obligations;
CREATE POLICY resolved_obligations_update_org ON public.resolved_obligations FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS resolved_obligations_all_service_role ON public.resolved_obligations;
CREATE POLICY resolved_obligations_all_service_role ON public.resolved_obligations FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON TABLE public.resolved_obligations TO authenticated;
GRANT ALL ON TABLE public.resolved_obligations TO service_role;
