-- FI-06/07 deployed: QA family ZZQAFI120104 — whose Person the approved parent details reached,
-- that adult's household membership and link-recipient role, duplicates, and the case ledger.
-- QA family only (test names, invented phone numbers).
WITH fam AS (
    SELECT id FROM public.customers WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND name LIKE '%ZZQAFI120104%'
), links AS (
    SELECT DISTINCT (l.metadata ->> 'recipient_person_id')::uuid AS person_id, l.id AS link_id
      FROM public.form_public_links l
      JOIN public.form_submissions fs ON fs.created_via_public_link_id = l.id
     WHERE fs.customer_id IN (SELECT id FROM fam)
)
SELECT question_id, kind, payload
FROM (
    SELECT 'p1_facts' AS question_id, 'row' AS kind,
           concat_ws(' | ', left(fv.entity_id::text, 8), fd.field_key, fv.value_text,
                     'is_link_recipient=' || (fv.entity_id IN (SELECT person_id FROM links))::text,
                     'in_household=' || EXISTS (SELECT 1 FROM public.customer_persons cp WHERE cp.person_id = fv.entity_id AND cp.customer_id IN (SELECT id FROM fam))::text) AS payload
      FROM public.field_values fv
      JOIN public.field_definitions fd ON fd.id = fv.field_definition_id
     WHERE fv.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND fv.entity_type = 'person'
       AND fd.field_key IN ('home_phone', 'work_phone', 'work_hours', 'work_address', 'employer', 'communication_preference')
       AND fv.entity_id IN (SELECT cp.person_id FROM public.customer_persons cp WHERE cp.customer_id IN (SELECT id FROM fam)
                            UNION SELECT person_id FROM links)
    UNION ALL
    SELECT 'p2_persons_named', 'row', concat_ws(' | ', left(p.id::text, 8), p.first_name, p.last_name, coalesce(p.phone, '-'))
      FROM public.persons p
     WHERE p.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND p.last_name LIKE '%ZZQAFI120104%'
    UNION ALL
    SELECT 'p3_recipients', 'row', concat_ws(' | ', left(person_id::text, 8), count(*)::text || ' links') FROM links GROUP BY person_id
    UNION ALL
    SELECT 'p4_case_ledger', 'row', concat_ws(' | ', left(pc.id::text, 8), left(k.key, 60), left((k.value ->> 'person_id'), 8), k.value ->> 'outcome', jsonb_array_length(coalesce(k.value -> 'written', '[]'::jsonb))::text || ' written')
      FROM public.processing_cases pc
      CROSS JOIN LATERAL jsonb_each(coalesce(pc.metadata -> 'person_contact_fact_commits', '{}'::jsonb)) k
     WHERE pc.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND pc.metadata ? 'person_contact_fact_commits'
       AND pc.created_at > now() - interval '1 day'
) q
ORDER BY question_id, payload;
