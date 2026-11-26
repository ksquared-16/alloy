-- Phase 0 / P0-1 — communication classification foundation.
--
-- PROBLEM (verified live 2026-07-30, project ikaxilmwmrmbagoidedu):
--   communication_messages has NO category column. enforceConsentForSend
--   therefore derives a category from the CHANNEL
--   (web/lib/communications/v2/consentEnforcement.ts:14-16,27), so every send
--   classifies as transactional and evaluateConsent permits it
--   (v2/consentGate.ts:49-53). The gate is structurally incapable of blocking.
--
--   Consent, opt-out, quiet hours, emergency handling and the operational vs
--   marketing boundary are all unenforceable without this column.
--
-- MODEL (Kelly's decision, 2026-07-30) — four orthogonal axes:
--   audience  external | internal
--   channel   email | sms | in_app          (in_app is the internal transport)
--   category  transactional | operational | marketing | emergency
--   purpose   domain/tenant key, compliance-INERT
--
--   `category` is platform-owned and closed. `purpose` is owned by the domain
--   or tenant and may never widen consent.
--
--   audience='internal' short-circuits recipient-consent evaluation entirely:
--   an internal staff note is not a communication to a data subject. It must
--   not inherit external consent behavior merely because it shares the runtime.
--
-- DEFAULTING (per direction: "new sends must not silently default to
-- transactional"; any fallback must be narrowly bounded, observable, retired):
--   The DEFAULT below exists ONLY so the NOT NULL column can be added to
--   existing rows (live: 7). It is 'operational' — the SAFER class, so a
--   mis-classification under-sends rather than over-sends. It is NEVER
--   'transactional'.
--   The API requires `category` explicitly; a bounded, counter-instrumented
--   fallback runs for one release, and migration
--   20260801100000_communication_category_drop_default.sql removes the default
--   so that an insert without a category then fails at the database.
--
-- ADDITIVE AND NULLABLE-FIRST. No drops. No destructive change in place.

-- 1) communication_messages ---------------------------------------------------

ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'external';

ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'operational';

ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS purpose text NULL;

-- The gate's decision inputs, frozen at enqueue. Python dispatch revalidation
-- (commit 4) reads this rather than re-deriving classification, so a queued
-- message cannot silently change class between enqueue and send.
ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS eligibility_snapshot jsonb NULL;

-- The dispatch-time verdict. Written when a send is blocked, so a blocked
-- message is explainable to an operator rather than silently absent.
ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS eligibility_decision jsonb NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.communication_messages'::regclass
          AND conname  = 'communication_messages_audience_chk'
    ) THEN
        ALTER TABLE public.communication_messages
            ADD CONSTRAINT communication_messages_audience_chk
            CHECK (audience IN ('external', 'internal'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.communication_messages'::regclass
          AND conname  = 'communication_messages_category_chk'
    ) THEN
        ALTER TABLE public.communication_messages
            ADD CONSTRAINT communication_messages_category_chk
            CHECK (category IN ('transactional', 'operational', 'marketing', 'emergency'));
    END IF;
END
$$;

-- 2) communication_scheduled_sends --------------------------------------------
-- Classification must be snapshotted at SCHEDULE time, not re-derived at drain:
-- a send approved as 'operational' must not become 'transactional' later.

ALTER TABLE public.communication_scheduled_sends
    ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'external';

ALTER TABLE public.communication_scheduled_sends
    ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'operational';

ALTER TABLE public.communication_scheduled_sends
    ADD COLUMN IF NOT EXISTS purpose text NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.communication_scheduled_sends'::regclass
          AND conname  = 'communication_scheduled_sends_audience_chk'
    ) THEN
        ALTER TABLE public.communication_scheduled_sends
            ADD CONSTRAINT communication_scheduled_sends_audience_chk
            CHECK (audience IN ('external', 'internal'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.communication_scheduled_sends'::regclass
          AND conname  = 'communication_scheduled_sends_category_chk'
    ) THEN
        ALTER TABLE public.communication_scheduled_sends
            ADD CONSTRAINT communication_scheduled_sends_category_chk
            CHECK (category IN ('transactional', 'operational', 'marketing', 'emergency'));
    END IF;
END
$$;

-- 3) Indexes ------------------------------------------------------------------
-- Dispatch revalidation and compliance reporting both filter outbound rows by
-- classification.

CREATE INDEX IF NOT EXISTS idx_comm_messages_audience_category
    ON public.communication_messages (org_id, audience, category)
    WHERE direction = 'outbound';

-- 4) Documentation ------------------------------------------------------------

COMMENT ON COLUMN public.communication_messages.audience IS
    'external | internal. internal short-circuits recipient-consent evaluation: a staff note is not a communication to a data subject.';
COMMENT ON COLUMN public.communication_messages.category IS
    'Platform-owned compliance class: transactional | operational | marketing | emergency. Closed vocabulary; NOT tenant-configurable. emergency is permissioned and audited.';
COMMENT ON COLUMN public.communication_messages.purpose IS
    'Domain/tenant key describing WHY the message exists (tour_reminder, payment_receipt, ...). Compliance-INERT: a purpose may never widen consent.';
COMMENT ON COLUMN public.communication_messages.eligibility_snapshot IS
    'Gate decision inputs frozen at enqueue: policy version, classification, resolved recipient, consent inputs, quiet-hours basis. Read by dispatch revalidation.';
COMMENT ON COLUMN public.communication_messages.eligibility_decision IS
    'Dispatch-time verdict when a send is blocked. Makes a blocked message explainable rather than silently absent.';
