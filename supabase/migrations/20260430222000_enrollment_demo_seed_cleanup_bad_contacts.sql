-- Cleanup bad Enrollment demo seed data:
-- - Delete legacy contacts created by enrollment demo seeds
-- - Null out opportunities.primary_contact_id for enrollment demo opportunities
-- - Remove legacy child_name/demo_child_name keys from opportunity.metadata (retain seed_key)
-- Idempotent + safe.

-- Delete demo contacts (legacy only).
DELETE FROM public.contacts c
WHERE c.metadata ? 'seed_key'
  AND (c.metadata->>'seed_key') LIKE 'enroll_demo_%';

-- Null out primary_contact_id for demo opportunities.
UPDATE public.opportunities o
SET primary_contact_id = NULL
WHERE o.metadata ? 'seed_key'
  AND (o.metadata->>'seed_key') LIKE 'enroll_demo_%'
  AND o.primary_contact_id IS NOT NULL;

-- Remove legacy child name fields from metadata (keeps other metadata intact).
UPDATE public.opportunities o
SET metadata = (o.metadata - 'child_name' - 'demo_child_name')
WHERE o.metadata ? 'seed_key'
  AND (o.metadata->>'seed_key') LIKE 'enroll_demo_%'
  AND (o.metadata ? 'child_name' OR o.metadata ? 'demo_child_name');

