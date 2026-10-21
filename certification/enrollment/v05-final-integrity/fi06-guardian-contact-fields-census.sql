-- FI-06 / FI-07: how the tenant's PUBLISHED forms ask for guardian work and phone details today —
-- schema only (labels, ids, bindings), no answers. Lil' Sunshine org.
SELECT question_id, kind, payload
FROM (
    SELECT 'f1_fields' AS question_id, 'row' AS kind,
           concat_ws(' | ', fd.name, 'v' || fv.version_number, f ->> 'id', f ->> 'type', left(f ->> 'label', 60),
                     'bind=' || coalesce(f -> 'binding' ->> 'entity_type', '') || '.' || coalesce(f -> 'binding' ->> 'field_key', ''),
                     'shared=' || coalesce(f ->> 'shared_value_key', f -> 'binding' ->> 'shared_value_key', ''),
                     'crm=' || coalesce(f ->> 'crm_mapping_key', f -> 'binding' ->> 'crm_mapping_key', ''),
                     'coll=' || coalesce(f -> 'collection_binding' ->> 'collection_provider_ref', '')) AS payload
      FROM public.form_definition_versions fv
      JOIN public.form_definitions fd ON fd.id = fv.form_definition_id
      CROSS JOIN LATERAL jsonb_path_query(fv.schema_json, 'lax $.**.fields[*]') f
     WHERE fd.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
       AND fv.status = 'published'
       AND (f ->> 'label') ~* '(employ|work|phone|cell|mobile|contact method|preferred contact|hours|guardian|parent)'
    UNION ALL
    SELECT 'f2_person_defs', 'row', concat_ws(' | ', field_key, field_type, is_active::text, section_key)
      FROM public.field_definitions
     WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND entity_type = 'person'
) q
ORDER BY question_id, payload;
