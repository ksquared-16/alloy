-- Why do the Firefly campus embeds still show the "first name" help text after a republish?
-- Read-only. One statement: question_id | kind | payload.
select 'embed_versions' as question_id, 'row' as kind, json_build_object(
  'links', (select json_agg(json_build_object(
      'token_tail', right(l.token_hash, 8),
      'is_active', l.is_active,
      'pinned_version_id', l.pinned_form_definition_version_id,
      'location_id', l.metadata->>'default_location_id',
      'updated_at', l.updated_at))
    from public.form_public_links l
    where l.token_hash in (
      encode(sha256(convert_to('mXZyldl_1mmztYfIffmEoZ4uzStB2EpqpP88HSsMaeA','UTF8')),'hex'),
      encode(sha256(convert_to('T4dfGkQfPVi2YwgTfRMNF3Yazq8Io2OFI53IeXiYvQ4','UTF8')),'hex'),
      encode(sha256(convert_to('N4AEQO5uIv8laGbfcng-cPg12HfgY_xCOOLKPiSpR_Y','UTF8')),'hex'))),
  'versions_of_served_form', (select json_agg(json_build_object(
      'id', v.id, 'version_number', v.version_number, 'status', v.status,
      'published_at', v.published_at, 'created_at', v.created_at, 'updated_at', v.updated_at,
      'first_name_help', (select f->>'description' from jsonb_array_elements(v.schema_json->'fields') f where f->>'id' = 'child_first_name'))
      order by v.version_number desc)
    from public.form_definition_versions v
    where v.form_definition_id = 'ade9052c-0bf8-47df-9f95-1d20c8fdc07f'),
  'recent_edits_in_org', (select json_agg(r) from (
      select fd.id as form_id, fd.name, fd.key, v.version_number, v.status, v.published_at,
             coalesce(v.updated_at, v.created_at) as touched_at,
             (select f->>'description' from jsonb_array_elements(v.schema_json->'fields') f where f->>'id' = 'child_first_name') as first_name_help
      from public.form_definition_versions v
      join public.form_definitions fd on fd.id = v.form_definition_id
      where v.org_id = (select org_id from public.form_definitions where id = 'ade9052c-0bf8-47df-9f95-1d20c8fdc07f')
        and coalesce(v.updated_at, v.created_at) > now() - interval '2 days'
      order by coalesce(v.updated_at, v.created_at) desc limit 15) r)
)::text as payload;
