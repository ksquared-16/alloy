-- Schedule linkage to subscription + reschedule/cancel fields.

ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS customer_subscription_id uuid REFERENCES public.customer_subscriptions(id) ON DELETE SET NULL;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS subscription_sequence int;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS rescheduled_from_schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS canceled_by text;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE INDEX IF NOT EXISTS schedules_customer_subscription_id_idx ON public.schedules (customer_subscription_id);
CREATE INDEX IF NOT EXISTS schedules_rescheduled_from_schedule_id_idx ON public.schedules (rescheduled_from_schedule_id);

COMMENT ON COLUMN public.schedules.customer_subscription_id IS 'Subscription this occurrence belongs to';
COMMENT ON COLUMN public.schedules.subscription_sequence IS '1-based occurrence number within the subscription';
COMMENT ON COLUMN public.schedules.rescheduled_from_schedule_id IS 'If rescheduled, points to the original schedule';
COMMENT ON COLUMN public.schedules.canceled_at IS 'When this occurrence was canceled';
COMMENT ON COLUMN public.schedules.canceled_by IS 'Who canceled (e.g. customer, admin)';
COMMENT ON COLUMN public.schedules.cancel_reason IS 'Optional reason for cancel';
