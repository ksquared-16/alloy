-- How many durable tour invitations exist, and when were they minted?
--
-- Speculative warming POSTed the tour-invitation prepare endpoint on hover, focus and mere
-- visibility, minting a durable invitation and its PUBLIC booking tokens every time. This is the
-- BEFORE count for the live proof: after the fix, hovering and focusing the Send Tour Invitation
-- action must not move it at all.
--
-- Counts and timestamps only. No recipient identity is selected: the question is how many rows
-- speculation created and when, and answering it does not require naming a family.
SELECT question_id, kind, payload
FROM (
    SELECT 'q1_total_invitations' AS question_id,
           'scalar' AS kind,
           count(*)::text AS payload,
           1 AS ord
      FROM public.tour_invitations i
     WHERE i.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'

    UNION ALL

    -- Per opportunity, so a family that accumulated many is visible as a cluster.
    SELECT 'q2_by_opportunity',
           'row',
           concat_ws(' | ',
               'opportunity=' || coalesce(to_jsonb(i.*) ->> 'opportunity_id', 'null'),
               'count=' || count(*)::text,
               'first=' || min(to_jsonb(i.*) ->> 'created_at'),
               'last=' || max(to_jsonb(i.*) ->> 'created_at')
           ),
           2
      FROM public.tour_invitations i
     WHERE i.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
     GROUP BY to_jsonb(i.*) ->> 'opportunity_id'

    UNION ALL

    -- The public booking links speculation reserved alongside each invitation.
    SELECT 'q3_public_booking_links',
           'scalar',
           count(*)::text,
           3
      FROM public.tour_public_booking_links l
) s
ORDER BY ord, payload;
