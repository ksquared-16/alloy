-- V0.5 (OPWORK_2CEA84351D90_SPRINT_4FC789334944) c1 — CURRENT configuration census, READ-ONLY.
-- Verifies (never recreates) the historical Lil' Sunshine enrollment configuration recorded on
-- 2026-10-21 (web/.qa1503/ls/state.json, preserved in the evidence hold):
--   packet 84fc5674-b26e-4138-9134-95f6f37fdd45 · BP department 3933ac47 revision 59 (a32816b4) ·
--   five forms · Registration fee template c03e638e (7500 cents per child).
-- Org 93667019-bd28-49b5-a688-acc9bb1e0a19. SELECT only.
WITH ids AS (
    SELECT '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid AS org,
           '84fc5674-b26e-4138-9134-95f6f37fdd45'::uuid AS packet,
           '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid AS dept,
           'a32816b4-41c4-4848-9e6f-9e554fb73d58'::uuid AS rev59,
           'c03e638e-0f3e-49f0-9d41-696276c8fa21'::uuid AS fee
), forms(form_id, role) AS (
    VALUES ('0a84c578-9068-4df7-bc9c-8b45afdecab5'::uuid, 'application'),
           ('e54ddde3-2784-45ca-bf58-388d92693a6e'::uuid, 'occ_ta806'),
           ('01fc00c4-8da2-404f-b9d4-7b2a373def36'::uuid, 'immunization'),
           ('6628005d-234c-4e11-b899-35b393aec52c'::uuid, 'sunscreen'),
           ('f2d4c0a0-a6de-491d-ab41-e55e1729bebc'::uuid, 'medical_release')
), latest_rev AS (
    SELECT r.* FROM public.business_process_revisions r, ids
     WHERE r.org_id = ids.org AND r.department_id = ids.dept
     ORDER BY r.revision_number DESC LIMIT 1
)
SELECT question_id, kind, payload
FROM (
    SELECT 'p1_packet' AS question_id, 'row' AS kind,
           concat_ws(' | ', left(p.id::text, 8), p.key, p.name, 'active=' || p.is_active::text, 'updated=' || p.updated_at::text) AS payload
      FROM public.form_packet_definitions p, ids WHERE p.id = ids.packet AND p.org_id = ids.org
    UNION ALL
    SELECT 'p2_packet_items', 'row',
           concat_ws(' | ', i.sequence_index::text, left(i.form_definition_id::text, 8),
                     'pinned=' || left(coalesce(i.pinned_form_definition_version_id::text, '-'), 8),
                     coalesce((SELECT f.name FROM public.form_definitions f WHERE f.id = i.form_definition_id), '?'))
      FROM public.form_packet_items i, ids WHERE i.packet_definition_id = ids.packet AND i.org_id = ids.org
    UNION ALL
    SELECT 'p3_same_name_packets', 'count',
           count(*)::text || ' packet definitions share key or name with 84fc5674 (1 = not recreated)'
      FROM public.form_packet_definitions d, ids
     WHERE d.org_id = ids.org
       AND (d.key = (SELECT key FROM public.form_packet_definitions WHERE id = ids.packet)
            OR d.name = (SELECT name FROM public.form_packet_definitions WHERE id = ids.packet))
    UNION ALL
    SELECT 'b1_rev59', 'row',
           concat_ws(' | ', left(r.id::text, 8), 'rev=' || r.revision_number::text, 'published_at=' || coalesce(r.published_at::text, '-'))
      FROM public.business_process_revisions r, ids WHERE r.id = ids.rev59 AND r.org_id = ids.org
    UNION ALL
    SELECT 'b2_latest_rev', 'row',
           concat_ws(' | ', left(l.id::text, 8), 'rev=' || l.revision_number::text, 'published_at=' || coalesce(l.published_at::text, '-'),
                     'refs_packet=' || (l.payload::text LIKE '%84fc5674-b26e-4138-9134-95f6f37fdd45%')::text,
                     'refs_fee=' || (l.payload::text LIKE '%c03e638e-0f3e-49f0-9d41-696276c8fa21%')::text,
                     'forms_referenced=' || (SELECT count(*) FROM forms WHERE l.payload::text LIKE '%' || forms.form_id::text || '%')::text)
      FROM latest_rev l
    UNION ALL
    SELECT 'b3_publication', 'row',
           concat_ws(' | ', c.domain_key, left(c.revision_id::text, 8), 'rev=' || c.revision_number::text, 'published_at=' || c.published_at::text)
      FROM public.configuration_publications c, ids
     WHERE c.org_id = ids.org AND (c.subject_id = ids.dept OR c.revision_id = ids.rev59)
    UNION ALL
    SELECT 'f1_forms', 'row',
           concat_ws(' | ', forms.role, left(f.id::text, 8), f.name, 'active=' || f.is_active::text,
                     'published_versions=' || (SELECT count(*) FROM public.form_definition_versions v WHERE v.form_definition_id = f.id AND v.status = 'published')::text,
                     'latest_published=v' || coalesce((SELECT max(v.version_number) FROM public.form_definition_versions v WHERE v.form_definition_id = f.id AND v.status = 'published')::text, '-'))
      FROM forms JOIN public.form_definitions f ON f.id = forms.form_id, ids WHERE f.org_id = ids.org
    UNION ALL
    SELECT 'f2_forms_missing', 'count',
           count(*)::text || ' of 5 historical forms absent'
      FROM forms WHERE NOT EXISTS (SELECT 1 FROM public.form_definitions f WHERE f.id = forms.form_id)
    UNION ALL
    SELECT 'm1_fee_template', 'row',
           concat_ws(' | ', left(t.id::text, 8), t.template_key, t.label, t.amount_strategy, 'amount_cents=' || coalesce(t.amount_cents::text, '-'),
                     'trigger=' || coalesce(t.trigger_type, '-') || ':' || coalesce(t.trigger_key, '-'), 'active=' || t.is_active::text, 'updated=' || t.updated_at::text)
      FROM public.financial_charge_templates t, ids WHERE t.id = ids.fee AND t.org_id = ids.org
    UNION ALL
    SELECT 'm2_same_key_templates', 'count',
           count(*)::text || ' active templates share template_key with c03e638e (1 = not recreated)'
      FROM public.financial_charge_templates t, ids
     WHERE t.org_id = ids.org AND t.is_active
       AND t.template_key = (SELECT template_key FROM public.financial_charge_templates WHERE id = ids.fee)
) q
ORDER BY question_id, payload;
