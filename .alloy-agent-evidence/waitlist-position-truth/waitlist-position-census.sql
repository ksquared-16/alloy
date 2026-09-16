-- Waitlist manual-position truth census (READ-ONLY, PII-safe, SINGLE STATEMENT).
-- Target candidate: 698f850a-2441-48d5-bed3-0b0870afa848
-- Recovers: the full override history for the target (to establish the TRUE pre-test pin_ordinal
-- for canonical restoration), the cohort membership, and existence guards so an all-zero result
-- can be distinguished from a wrong id. Ids / ordinals / keys / statuses / timestamps only.
SELECT json_build_object(
  'target_candidate', (
    SELECT json_build_object(
      'candidate_id', pc.id, 'org_id', pc.org_id, 'site_id', pc.site_id,
      'program_room_cohort_key', pc.program_room_cohort_key,
      'program_room_group_label', pc.program_room_group_label,
      'status', pc.status, 'is_synthetic_fallback', pc.is_synthetic_fallback,
      'wait_since', pc.wait_since, 'desired_start_date', pc.desired_start_date,
      'created_at', pc.created_at, 'updated_at', pc.updated_at)
    FROM public.placement_candidates pc
    WHERE pc.id = '698f850a-2441-48d5-bed3-0b0870afa848'),
  'target_override_history', (
    SELECT json_agg(json_build_object(
      'override_id', po.id, 'override_kind', po.override_kind,
      'cohort_key', po.program_room_cohort_key,
      'is_active', po.is_active,
      'pin_ordinal', po.payload ->> 'pin_ordinal',
      'release_reason', po.payload ->> 'release_reason',
      'reason', po.reason,
      'expires_at', po.expires_at, 'released_at', po.released_at,
      'created_at', po.created_at, 'updated_at', po.updated_at)
      ORDER BY po.created_at)
    FROM public.placement_overrides po
    WHERE po.placement_candidate_id = '698f850a-2441-48d5-bed3-0b0870afa848'),
  'cohort_members', (
    SELECT json_agg(json_build_object(
      'candidate_id', pc.id,
      'is_target', (pc.id = '698f850a-2441-48d5-bed3-0b0870afa848'),
      'cohort_key', pc.program_room_cohort_key,
      'status', pc.status, 'site_id', pc.site_id,
      'wait_since', pc.wait_since, 'created_at', pc.created_at,
      'active_pin_ordinal', (
        SELECT p2.payload ->> 'pin_ordinal' FROM public.placement_overrides p2
        WHERE p2.placement_candidate_id = pc.id AND p2.override_kind = 'pin'
          AND p2.is_active = true AND p2.released_at IS NULL LIMIT 1),
      'active_override_count', (
        SELECT COUNT(*) FROM public.placement_overrides p3
        WHERE p3.placement_candidate_id = pc.id AND p3.is_active = true))
      ORDER BY pc.wait_since NULLS LAST, pc.created_at)
    FROM public.placement_candidates pc
    WHERE pc.org_id = (SELECT org_id FROM public.placement_candidates
                       WHERE id = '698f850a-2441-48d5-bed3-0b0870afa848')
      AND pc.program_room_cohort_key = (SELECT program_room_cohort_key FROM public.placement_candidates
                                        WHERE id = '698f850a-2441-48d5-bed3-0b0870afa848')),
  'existence_guard', json_build_object(
    'target_candidate_rows', (SELECT COUNT(*) FROM public.placement_candidates
      WHERE id = '698f850a-2441-48d5-bed3-0b0870afa848'),
    'org_candidate_total', (SELECT COUNT(*) FROM public.placement_candidates pc
      WHERE pc.org_id = (SELECT org_id FROM public.placement_candidates
                         WHERE id = '698f850a-2441-48d5-bed3-0b0870afa848')),
    'org_override_total', (SELECT COUNT(*) FROM public.placement_overrides po
      WHERE po.org_id = (SELECT org_id FROM public.placement_candidates
                         WHERE id = '698f850a-2441-48d5-bed3-0b0870afa848')))
) AS census;
