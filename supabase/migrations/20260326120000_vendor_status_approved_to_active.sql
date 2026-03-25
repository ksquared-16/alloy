-- Assignable vendor status: vendor_statuses.key "approved" → "active" (aligns with app VENDOR_ASSIGNMENT_VENDOR_STATUS_KEY).
-- After this, admin activates vendors with status_key / vendor_statuses.key = active.

UPDATE public.vendor_statuses
SET key = 'active',
    label = 'Active'
WHERE key = 'approved';

UPDATE public.vendors
SET status_key = 'active'
WHERE status_key = 'approved';

-- Admin drawer / assertAllowedStatusKey use status_definitions for vendors.
UPDATE public.status_definitions
SET status_key = 'active',
    status_label = 'Active'
WHERE entity_type = 'vendors'
  AND status_key = 'approved';

-- If any workflow_actions.payload JSON references "status_key":"approved" for vendors_query, update those rows in Supabase or re-save the workflow in admin.
