-- Communications V1 canonical tables (Cards 2+). Does NOT alter public.messages / messages_outbox.
-- Thread uniqueness: CARD 1.5 — org + primary_entity + channel + recipient_key.

CREATE TABLE IF NOT EXISTS public.communication_provider_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  provider text NOT NULL,
  scope text NOT NULL DEFAULT 'org' CHECK (scope IN ('org', 'location', 'user')),
  location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  user_id uuid NULL,
  inbound_to_e164 text NULL,
  display_label text NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending_verification')),
  is_primary boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text NOT NULL DEFAULT 'unconfigured',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS communication_bindings_org_inbound_to_uq
  ON public.communication_provider_bindings (org_id, inbound_to_e164)
  WHERE inbound_to_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_bindings_org_channel
  ON public.communication_provider_bindings (org_id, channel)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_comm_bindings_org_location_scope
  ON public.communication_provider_bindings (org_id, location_id, channel, scope)
  WHERE status = 'active';


CREATE TABLE IF NOT EXISTS public.communication_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  primary_entity_type text NOT NULL,
  primary_entity_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'in_app')),
  recipient_key text NOT NULL DEFAULT '',
  location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_threads_identity_uq UNIQUE (org_id, primary_entity_type, primary_entity_id, channel, recipient_key)
);

CREATE INDEX IF NOT EXISTS idx_comm_threads_org ON public.communication_threads (org_id);
CREATE INDEX IF NOT EXISTS idx_comm_threads_org_entity ON public.communication_threads (org_id, primary_entity_type, primary_entity_id);
CREATE INDEX IF NOT EXISTS idx_comm_threads_org_channel ON public.communication_threads (org_id, channel);


CREATE TABLE IF NOT EXISTS public.communication_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.communication_threads (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'in_app')),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status text NOT NULL DEFAULT 'queued',
  body text,
  body_format text NOT NULL DEFAULT 'plain',
  from_address text,
  to_address text,
  provider text,
  provider_message_id text,
  error text,
  workflow_run_id uuid REFERENCES public.workflow_runs (id) ON DELETE SET NULL,
  communication_provider_binding_id uuid REFERENCES public.communication_provider_bindings (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_comm_msgs_org ON public.communication_messages (org_id);
CREATE INDEX IF NOT EXISTS idx_comm_msgs_thread ON public.communication_messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_comm_msgs_org_thread_created ON public.communication_messages (org_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_msgs_queue ON public.communication_messages (org_id, status, channel, direction)
  WHERE direction = 'outbound' AND status = 'queued';


CREATE TABLE IF NOT EXISTS public.communication_message_reads (
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.communication_messages (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comm_reads_org ON public.communication_message_reads (org_id);


-- RLS — org members can read; mutations via service_role (Next admin API + backend worker).
ALTER TABLE public.communication_provider_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_message_reads ENABLE ROW LEVEL SECURITY;


CREATE POLICY communication_bindings_select_org
  ON public.communication_provider_bindings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.org_id = communication_provider_bindings.org_id));

CREATE POLICY communication_bindings_service_all
  ON public.communication_provider_bindings FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));


CREATE POLICY communication_threads_select_org
  ON public.communication_threads FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.org_id = communication_threads.org_id));

CREATE POLICY communication_threads_service_all
  ON public.communication_threads FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));


CREATE POLICY communication_messages_select_org
  ON public.communication_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.org_id = communication_messages.org_id));

CREATE POLICY communication_messages_service_all
  ON public.communication_messages FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));


CREATE POLICY communication_reads_select_org
  ON public.communication_message_reads FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.org_id = communication_message_reads.org_id));

CREATE POLICY communication_reads_service_all
  ON public.communication_message_reads FOR ALL TO authenticated
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));


GRANT ALL ON TABLE public.communication_provider_bindings TO anon;
GRANT ALL ON TABLE public.communication_provider_bindings TO authenticated;
GRANT ALL ON TABLE public.communication_provider_bindings TO service_role;

GRANT ALL ON TABLE public.communication_threads TO anon;
GRANT ALL ON TABLE public.communication_threads TO authenticated;
GRANT ALL ON TABLE public.communication_threads TO service_role;

GRANT ALL ON TABLE public.communication_messages TO anon;
GRANT ALL ON TABLE public.communication_messages TO authenticated;
GRANT ALL ON TABLE public.communication_messages TO service_role;

GRANT ALL ON TABLE public.communication_message_reads TO anon;
GRANT ALL ON TABLE public.communication_message_reads TO authenticated;
GRANT ALL ON TABLE public.communication_message_reads TO service_role;


COMMENT ON TABLE public.communication_provider_bindings IS 'Per-org/channel provider routing; secrets via secret_ref only (env name or sentinel), never raw keys in config jsonb.';
COMMENT ON TABLE public.communication_threads IS 'Entity-linked conversation thread; CARD 1.5 composite identity includes recipient_key.';
COMMENT ON TABLE public.communication_messages IS 'Canonical communication rows (SMS/email/in-app).';
COMMENT ON COLUMN public.communication_provider_bindings.secret_ref IS 'Opaque ref: legacy_global_twilio | unconfigured | env:VAR_NAME — resolved at runtime';
