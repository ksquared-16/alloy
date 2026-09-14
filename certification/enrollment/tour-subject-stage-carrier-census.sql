-- Where does the disposable Tour case actually carry its builder stage?
--
-- The transition preflight resolves the builder stage from `opportunities.status_key` mapped through
-- STATUS DEFINITION metadata, and returned null for both ends. The queue resolves the same thing from
-- the OPPORTUNITY's own metadata and gets `tour`. Before changing shared resolution logic, this reads
-- both carriers for the one subject, so the fix targets the carrier that actually holds the truth.
SELECT question_id, kind, payload
FROM (
    SELECT 'q1_opportunity' AS question_id,
           'row' AS kind,
           concat_ws(' | ',
               'id=' || o.id::text,
               'status_key=' || coalesce(to_jsonb(o.*) ->> 'status_key', 'null'),
               'metadata=' || coalesce((to_jsonb(o.*) -> 'metadata')::text, 'null')
           ) AS payload,
           1 AS ord
      FROM public.opportunities o
     WHERE o.id = '8baf8418-654d-41dc-9779-1c8c44198e41'

    UNION ALL

    -- The status definitions for both ends of the attempted transition.
    SELECT 'q2_status_definitions',
           'row',
           concat_ws(' | ',
               'key=' || coalesce(to_jsonb(s.*) ->> 'key', 'null'),
               'metadata=' || coalesce((to_jsonb(s.*) -> 'metadata')::text, 'null')
           ),
           2
      FROM public.status_definitions s
     WHERE s.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
       AND coalesce(to_jsonb(s.*) ->> 'key', '') IN ('open', 'decision', 'tour')

    UNION ALL

    -- The open stage work on this case, to confirm Conduct Tour is genuinely unresolved.
    SELECT 'q3_open_work',
           'row',
           concat_ws(' | ',
               'id=' || t.id::text,
               'title=' || coalesce(to_jsonb(t.*) ->> 'title', 'null'),
               'status=' || coalesce(to_jsonb(t.*) ->> 'status', 'null'),
               'metadata=' || coalesce((to_jsonb(t.*) -> 'metadata')::text, 'null')
           ),
           3
      FROM public.operational_tasks t
     WHERE t.entity_id = '8baf8418-654d-41dc-9779-1c8c44198e41'
       AND coalesce(to_jsonb(t.*) ->> 'status', '') = 'open'
) s
ORDER BY ord, payload;
