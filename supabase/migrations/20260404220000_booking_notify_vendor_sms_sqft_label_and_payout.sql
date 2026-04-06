-- Vendor SMS workflow "Booking: Notify Vendor Assigned":
-- 1) Use enriched location.square_footage_tier_label (resolved in web/lib/workflowRun.ts) instead of raw tier key.
-- 2) Use booking_pay_and_vendor_payout (customer booking_price + per-vendor payout from org/vendor policy) for the pay line.

UPDATE public.workflow_actions wa
SET payload = replace(
  wa.payload::text,
  '{{location.square_footage_tier_key}}',
  '{{location.square_footage_tier_label}}'
)::jsonb
FROM public.workflows w
WHERE w.id = wa.workflow_id
  AND w.name = 'Booking: Notify Vendor Assigned'
  AND wa.action_type = 'send_message'
  AND wa.payload::text LIKE '%{{location.square_footage_tier_key}}%';

UPDATE public.workflow_actions wa
SET payload = replace(
  wa.payload::text,
  'Pay: {{booking_price}}',
  '{{booking_pay_and_vendor_payout}}'
)::jsonb
FROM public.workflows w
WHERE w.id = wa.workflow_id
  AND w.name = 'Booking: Notify Vendor Assigned'
  AND wa.action_type = 'send_message'
  AND wa.payload::text LIKE '%Pay: {{booking_price}}%'
  AND wa.payload::text NOT LIKE '%booking_pay_and_vendor_payout%';

UPDATE public.workflow_actions wa
SET payload = replace(
  wa.payload::text,
  'Pay:{{booking_price}}',
  '{{booking_pay_and_vendor_payout}}'
)::jsonb
FROM public.workflows w
WHERE w.id = wa.workflow_id
  AND w.name = 'Booking: Notify Vendor Assigned'
  AND wa.action_type = 'send_message'
  AND wa.payload::text LIKE '%Pay:{{booking_price}}%'
  AND wa.payload::text NOT LIKE '%booking_pay_and_vendor_payout%';
