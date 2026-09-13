-- Did "Spot offered" move the child, complete the offer work, and leave the sibling alone?
-- Subject: Lennon Kurzman b247b8a3-7df7-4919-9309-698796b59c3b
--
-- Rows are emitted as whole-row JSON rather than named columns on purpose: the participation and
-- work tables carry their stage/disposition in fields this lane has not verified, and a census that
-- guesses a column name fails as "column does not exist" and proves nothing. Filtering through
-- `to_jsonb(t.*) ->> 'key'` is null-safe when a table does not have that column at all, so one
-- statement answers all three questions without a schema assumption that could be wrong.
SELECT question_id, kind, payload
FROM (
    -- q1: the child's own participation row, whole
    SELECT 'q1_participation' AS question_id,
           'row' AS kind,
           to_jsonb(ocm.*)::text AS payload,
           1 AS ord
      FROM public.opportunity_customer_members ocm
     WHERE ocm.customer_member_id = 'b247b8a3-7df7-4919-9309-698796b59c3b'

    UNION ALL

    -- q2: every participation in the same opportunity, to prove the sibling did not move
    SELECT 'q2_siblings',
           'row',
           to_jsonb(sib.*)::text,
           2
      FROM public.opportunity_customer_members sib
     WHERE sib.opportunity_id IN (
               SELECT o.opportunity_id
                 FROM public.opportunity_customer_members o
                WHERE o.customer_member_id = 'b247b8a3-7df7-4919-9309-698796b59c3b'
           )

    UNION ALL

    -- q3: this child's work — the offer work's final state, and anything the outcome created
    SELECT 'q3_work',
           'row',
           to_jsonb(w.*)::text,
           3
      FROM public.work_units w
     WHERE to_jsonb(w.*) ->> 'customer_member_id' = 'b247b8a3-7df7-4919-9309-698796b59c3b'
) s
ORDER BY ord, payload;
