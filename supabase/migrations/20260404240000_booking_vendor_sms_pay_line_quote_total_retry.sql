-- Retry (staging already applied 20260404230000 with 0 rows or pre-fix SQL): same targeted jsonb_set fix.

UPDATE public.workflow_actions wa
SET payload = jsonb_set(wa.payload, '{template}', to_jsonb(
  replace(wa.payload->>'template', 'Pay: ${{job.metadata.quote_total}}', '{{booking_pay_and_vendor_payout}}')
), true)
FROM public.workflows w
WHERE w.id = wa.workflow_id
  AND w.name = 'Booking: Notify Vendor Assigned'
  AND wa.action_type = 'send_message'
  AND wa.payload ? 'template'
  AND wa.payload->>'template' LIKE '%Pay: ${{job.metadata.quote_total}}%';

UPDATE public.workflow_actions wa
SET payload = jsonb_set(wa.payload, '{body}', to_jsonb(
  replace(wa.payload->>'body', 'Pay: ${{job.metadata.quote_total}}', '{{booking_pay_and_vendor_payout}}')
), true)
FROM public.workflows w
WHERE w.id = wa.workflow_id
  AND w.name = 'Booking: Notify Vendor Assigned'
  AND wa.action_type = 'send_message'
  AND wa.payload ? 'body'
  AND wa.payload->>'body' LIKE '%Pay: ${{job.metadata.quote_total}}%';
