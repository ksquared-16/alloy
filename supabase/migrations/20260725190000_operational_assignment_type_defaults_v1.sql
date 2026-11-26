-- Seed default Assignment Types for every org that does not already have them.
-- Vocabulary matches Assignment Platform operator examples — no invented extras.

INSERT INTO public.operational_assignment_types (
  org_id,
  key,
  label,
  icon_key,
  visual_tone,
  subject_types,
  billing_participation,
  attendance_participation,
  staffing_participation,
  sort_order,
  is_active
)
SELECT
  o.id,
  v.key,
  v.label,
  v.icon_key,
  v.visual_tone,
  v.subject_types,
  v.billing_participation,
  v.attendance_participation,
  v.staffing_participation,
  v.sort_order,
  true
FROM public.orgs o
CROSS JOIN (
  VALUES
    ('primary_classroom', 'Primary Classroom', 'door-open', 'accent', ARRAY['child']::text[], 'eligible', 'expected', 'demand', 10),
    ('before_care', 'Before Care', 'sunrise', 'info', ARRAY['child']::text[], 'eligible', 'expected', 'demand', 20),
    ('after_care', 'After Care', 'sunset', 'info', ARRAY['child']::text[], 'eligible', 'expected', 'demand', 30),
    ('enrichment', 'Enrichment', 'sparkles', 'success', ARRAY['child']::text[], 'eligible', 'expected', 'demand', 40),
    ('transportation', 'Transportation', 'bus', 'neutral', ARRAY['child']::text[], 'none', 'none', 'none', 50),
    ('therapy', 'Therapy', 'heart-pulse', 'warning', ARRAY['child']::text[], 'none', 'none', 'none', 60),
    ('recurring_service', 'Recurring Service', 'repeat', 'neutral', ARRAY['child', 'staff']::text[], 'none', 'none', 'none', 70)
) AS v(
  key,
  label,
  icon_key,
  visual_tone,
  subject_types,
  billing_participation,
  attendance_participation,
  staffing_participation,
  sort_order
)
ON CONFLICT (org_id, key) DO NOTHING;
