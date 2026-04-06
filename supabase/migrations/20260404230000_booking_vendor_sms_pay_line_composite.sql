-- "Booking: Notify Vendor Assigned": replace Pay line using job.metadata.quote_total with
-- {{booking_pay_and_vendor_payout}} (customer total from root booking_price + per-vendor payout;
-- see web/lib/workflowRun.ts createVendorOfferAcceptLinkAndBody).

UPDATE public.workflow_actions wa
SET payload = replace(
  wa.payload::text,
  'Pay: ${{job.metadata.quote_total}}',
  '{{booking_pay_and_vendor_payout}}'
)::jsonb
FROM public.workflows w
WHERE w.id = wa.workflow_id
  AND w.name = 'Booking: Notify Vendor Assigned'
  AND wa.action_type = 'send_message'
  AND wa.payload::text LIKE '%Pay: ${{job.metadata.quote_total}}%';

UPDATE public.workflow_actions wa
SET payload = replace(
  wa.payload::text,
  'Pay: {{job.metadata.quote_total}}',
  '{{booking_pay_and_vendor_payout}}'
)::jsonb
FROM public.workflows w
WHERE w.id = wa.workflow_id
  AND w.name = 'Booking: Notify Vendor Assigned'
  AND wa.action_type = 'send_message'
  AND wa.payload::text LIKE '%Pay: {{job.metadata.quote_total}}%'
  AND wa.payload::text NOT LIKE '%Pay: ${{job.metadata.quote_total}}%';

UPDATE public.workflow_actions wa
SET payload = replace(
  wa.payload::text,
  'Pay:${{job.metadata.quote_total}}',
  '{{booking_pay_and_vendor_payout}}'
)::jsonb
FROM public.workflows w
WHERE w.id = wa.workflow_id
  AND w.name = 'Booking: Notify Vendor Assigned'
  AND wa.action_type = 'send_message'
  AND wa.payload::text LIKE '%Pay:${{job.metadata.quote_total}}%';
