-- V0.5 (OPWORK_2CEA84351D90_SPRINT_4FC789334944) c1 follow-up, READ-ONLY.
-- (a) Are the 4 packets matching 84fc5674 same-KEY (recreated) or same-NAME only?
-- (b) How does BP revision 59 (a32816b4) wire the enrolling financial requirement, given its payload
--     does not cite fee template c03e638e by id?
WITH ids AS (
    SELECT '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid AS org,
           '84fc5674-b26e-4138-9134-95f6f37fdd45'::uuid AS packet,
           'a32816b4-41c4-4848-9e6f-9e554fb73d58'::uuid AS rev59
)
SELECT question_id, kind, payload
FROM (
    SELECT 'k1_same_key' AS question_id, 'count' AS kind,
           count(*)::text || ' packets with key bp_rev_a32816b4…_enrolling' AS payload
      FROM public.form_packet_definitions d, ids
     WHERE d.org_id = ids.org AND d.key = (SELECT key FROM public.form_packet_definitions WHERE id = ids.packet)
    UNION ALL
    SELECT 'k2_same_name_rows', 'row',
           concat_ws(' | ', left(d.id::text, 8), d.key, 'active=' || d.is_active::text, 'created=' || d.created_at::text)
      FROM public.form_packet_definitions d, ids
     WHERE d.org_id = ids.org AND d.name = (SELECT name FROM public.form_packet_definitions WHERE id = ids.packet)
    UNION ALL
    SELECT 'r1_financial_snippets', 'row',
           left(m[1], 300)
      FROM public.business_process_revisions r, ids,
           LATERAL regexp_matches(r.payload::text, '("kind": ?"financial"[^}]{0,255})', 'g') AS m
     WHERE r.id = ids.rev59
    UNION ALL
    SELECT 'r2_fee_key_mentions', 'count',
           'registration_fee=' || (r.payload::text LIKE '%registration_fee%')::text
           || ' | charge_template=' || (r.payload::text LIKE '%charge_template%')::text
      FROM public.business_process_revisions r, ids WHERE r.id = ids.rev59
) q
ORDER BY question_id, payload;
