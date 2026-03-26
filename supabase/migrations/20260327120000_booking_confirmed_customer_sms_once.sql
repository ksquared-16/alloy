-- booking_confirmed customer workflow 6597d056-b412-48c3-96b0-ea665facc23f:
-- Single SMS via create_message + {{person.phone}}; drop redundant send_message if present.
-- Safe to run multiple times (DELETE/UPDATE are idempotent).

DELETE FROM public.workflow_actions
WHERE workflow_id = '6597d056-b412-48c3-96b0-ea665facc23f'
  AND action_type = 'send_message';

UPDATE public.workflow_actions
SET payload = jsonb_set(
        COALESCE(payload::jsonb, '{}'::jsonb),
        '{to_value}',
        to_jsonb('{{person.phone}}'::text)
    )
WHERE workflow_id = '6597d056-b412-48c3-96b0-ea665facc23f'
  AND action_type = 'create_message'
  AND (payload->>'to_value' IS DISTINCT FROM '{{person.phone}}');

WITH ordered AS (
    SELECT id,
        ROW_NUMBER() OVER (ORDER BY action_order) AS new_order
    FROM public.workflow_actions
    WHERE workflow_id = '6597d056-b412-48c3-96b0-ea665facc23f'
)
UPDATE public.workflow_actions wa
SET action_order = o.new_order
FROM ordered o
WHERE wa.id = o.id
  AND wa.action_order IS DISTINCT FROM o.new_order;
