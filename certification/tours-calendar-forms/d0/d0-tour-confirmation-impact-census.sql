-- D0 (Tours / Calendar / Public Forms): impact of public-book confirmation sends — COUNTS ONLY, all orgs.
SELECT question_id, kind, payload
FROM (
    SELECT 'r1_rules_approval_required' AS question_id, 'count' AS kind,
           concat_ws(' | ', 'approval_required=' || approval_required::text, 'active=' || is_active::text, count(*)::text) AS payload
      FROM public.tour_availability_rules GROUP BY approval_required, is_active
    UNION ALL
    SELECT 'b1_bookings_by_status_source', 'count',
           concat_ws(' | ', status_key, coalesce(source, '-'), count(*)::text)
      FROM public.tour_bookings GROUP BY status_key, source
    UNION ALL
    SELECT 'm1_confirmation_sent_while_unconfirmed', 'count',
           concat_ws(' | ', 'booking_now=' || b.status_key, 'source=' || coalesce(b.source, '-'), count(*)::text)
      FROM public.communication_messages m
      JOIN public.tour_bookings b ON b.id::text = m.metadata ->> 'tour_booking_id'
     WHERE m.metadata ->> 'event_key' = 'tour_confirmation'
     GROUP BY b.status_key, b.source
) q
ORDER BY question_id, payload;
