-- Workflows: generic conditions (target_entity, field_path, operator, value), messaging outbox.
-- Canonical entity types: customer, contact, job, schedule, opportunity, vendor.

-- workflow_conditions: support generic evaluation across all entity types
ALTER TABLE public.workflow_conditions ADD COLUMN IF NOT EXISTS target_entity text;
ALTER TABLE public.workflow_conditions ADD COLUMN IF NOT EXISTS field_path text;
-- operator may already exist as text
ALTER TABLE public.workflow_conditions ADD COLUMN IF NOT EXISTS operator text;
-- value may already exist as text; add value_jsonb for jsonb if we need both for backfill
ALTER TABLE public.workflow_conditions ADD COLUMN IF NOT EXISTS value_jsonb jsonb;
ALTER TABLE public.workflow_conditions ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;

-- Backfill: target_entity from parent workflow
UPDATE public.workflow_conditions c
SET target_entity = w.entity_type
FROM public.workflows w
WHERE c.workflow_id = w.id AND (c.target_entity IS NULL OR c.target_entity = '');

-- Backfill field_path from legacy "field" column if present (e.g. job.service_frequency_key -> field_path = service_frequency_key, target_entity = job)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_conditions' AND column_name = 'field') THEN
    UPDATE public.workflow_conditions
    SET field_path = CASE
      WHEN "field" IS NULL OR "field" = '' THEN ''
      WHEN position('.' in "field") > 0 THEN substring("field" from position('.' in "field") + 1)
      ELSE "field"
    END,
    target_entity = CASE
      WHEN target_entity IS NULL OR target_entity = '' AND "field" IS NOT NULL AND position('.' in "field") > 0
      THEN split_part("field", '.', 1)
      ELSE target_entity
    END
    WHERE (field_path IS NULL OR field_path = '') AND "field" IS NOT NULL AND "field" != '';
  END IF;
END $$;

-- Backfill value_jsonb from legacy "value" text where possible
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_conditions' AND column_name = 'value') THEN
    UPDATE public.workflow_conditions
    SET value_jsonb = to_jsonb("value"::text)
    WHERE value_jsonb IS NULL AND "value" IS NOT NULL AND "value"::text != '';
  END IF;
END $$;

-- workflow_actions: target_entity already exists; ensure it supports all 6 (app-validated). No schema change.

-- messages_outbox: queue for workflow send_message fanout (Twilio or log)
CREATE TABLE IF NOT EXISTS public.messages_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid,
    workflow_run_id uuid REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
    channel text NOT NULL,
    to_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    to_phone text,
    to_email text,
    body text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    dedupe_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    error text
);

CREATE INDEX IF NOT EXISTS messages_outbox_org_id_idx ON public.messages_outbox (org_id);
CREATE INDEX IF NOT EXISTS messages_outbox_workflow_run_id_idx ON public.messages_outbox (workflow_run_id);
CREATE INDEX IF NOT EXISTS messages_outbox_status_idx ON public.messages_outbox (status);
CREATE INDEX IF NOT EXISTS messages_outbox_dedupe_key_idx ON public.messages_outbox (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Prevent duplicate blasts: unique on (org_id, dedupe_key, to_phone) when dedupe_key is set
CREATE UNIQUE INDEX IF NOT EXISTS messages_outbox_dedupe_org_key_phone
ON public.messages_outbox (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), dedupe_key, coalesce(to_phone, ''))
WHERE dedupe_key IS NOT NULL AND dedupe_key != '';

COMMENT ON TABLE public.messages_outbox IS 'Outbound message queue from workflow send_message actions; processed by sender (e.g. Twilio).';
