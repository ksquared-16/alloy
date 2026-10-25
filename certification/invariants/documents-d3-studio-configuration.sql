-- Documents D3 — Document Studio configuration holds at the database. Rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated certification environment (certenv-*) carrying
-- migrations 20261208090000, 20261209090000, 20261209090100 and 20261209090200. The executor owns the transaction and discards it.
-- Each CASE is one DO block; an invariant that does not hold RAISEs. An expected refusal is caught in its own sub-block.

CREATE TEMP TABLE d3_ctx (org uuid, other_org uuid, cat_a uuid, cat_b uuid, cat_c uuid, foreign_cat uuid, type_id uuid, v1 uuid, v2 uuid, child uuid);

-- CASE 0 — the schema and the starter vocabulary are present.
DO $$
DECLARE v_org uuid; v_other uuid; v_child uuid;
BEGIN
  IF to_regclass('public.document_categories') IS NULL OR to_regclass('public.document_type_versions') IS NULL THEN
    RAISE EXCEPTION 'CASE 0 FAILED: D3 tables missing';
  END IF;
  SELECT m.org_id INTO v_org FROM public.customer_members m ORDER BY m.org_id LIMIT 1;
  SELECT id INTO v_child FROM public.customer_members WHERE org_id = v_org ORDER BY id LIMIT 1;
  SELECT id INTO v_other FROM public.orgs WHERE id <> v_org ORDER BY id LIMIT 1;
  IF v_org IS NULL OR v_other IS NULL THEN RAISE EXCEPTION 'CASE 0 FAILED: need two organizations and a child'; END IF;
  IF (SELECT count(*) FROM public.document_types WHERE org_id = v_org AND seeded) < 13
     OR (SELECT count(*) FROM public.document_categories WHERE org_id = v_org AND seeded) < 10 THEN
    RAISE EXCEPTION 'CASE 0 FAILED: the starter vocabulary is missing';
  END IF;
  INSERT INTO d3_ctx (org, other_org, child) VALUES (v_org, v_other, v_child);
  RAISE NOTICE 'CASE 0 PASS schema and starter vocabulary present';
END $$;

-- CASE 1 — categories: stable key, organization-bound parents, no cycles, safe archival and deletion.
DO $$
DECLARE c record; a uuid; b uuid; cc uuid; f uuid;
BEGIN
  SELECT * INTO c FROM d3_ctx;
  INSERT INTO public.document_categories (org_id, key, label) VALUES (c.org, 'd3_inv_a', 'Inv A') RETURNING id INTO a;
  INSERT INTO public.document_categories (org_id, key, label, parent_id) VALUES (c.org, 'd3_inv_b', 'Inv B', a) RETURNING id INTO b;
  INSERT INTO public.document_categories (org_id, key, label, parent_id) VALUES (c.org, 'd3_inv_c', 'Inv C', b) RETURNING id INTO cc;
  INSERT INTO public.document_categories (org_id, key, label) VALUES (c.other_org, 'd3_inv_foreign', 'Foreign') RETURNING id INTO f;
  BEGIN
    UPDATE public.document_categories SET key = 'renamed_key' WHERE id = a;
    RAISE EXCEPTION 'CASE 1 FAILED: a category key changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.document_categories SET label = 'Inv A renamed' WHERE id = a;
  BEGIN
    UPDATE public.document_categories SET parent_id = cc WHERE id = a;
    RAISE EXCEPTION 'CASE 1 FAILED: a cycle was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.document_categories SET parent_id = a WHERE id = a;
    RAISE EXCEPTION 'CASE 1 FAILED: a category became its own parent';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.document_categories SET parent_id = f WHERE id = b;
    RAISE EXCEPTION 'CASE 1 FAILED: a parent from another organization was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.document_categories SET status = 'archived' WHERE id = a;
    RAISE EXCEPTION 'CASE 1 FAILED: a category with active children was archived';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.document_categories WHERE id = b;
    RAISE EXCEPTION 'CASE 1 FAILED: a category with children was deleted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.document_categories (org_id, key, label) VALUES (c.org, 'd3_inv_a', 'Duplicate');
    RAISE EXCEPTION 'CASE 1 FAILED: a duplicate key was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE d3_ctx SET cat_a = a, cat_b = b, cat_c = cc, foreign_cat = f;
  RAISE NOTICE 'CASE 1 PASS stable key; no cycle, self-parent or foreign parent; children block archive and delete';
END $$;

-- CASE 2 — the type lifecycle: draft → validated → published, compare-and-swap, immutable published versions.
DO $$
DECLARE c record; t uuid; x1 uuid; x2 uuid; r jsonb;
BEGIN
  SELECT * INTO c FROM d3_ctx;
  INSERT INTO public.document_types (org_id, key) VALUES (c.org, 'd3_inv_type') RETURNING id INTO t;
  INSERT INTO public.document_type_versions (org_id, document_type_id, version_number, label, category_id, subject_types, allowed_formats,
                                             default_sensitivity, validity_policy)
  VALUES (c.org, t, 1, 'Inv type', c.cat_c, ARRAY['child'], ARRAY['pdf'], 'standard', '{"kind": "duration", "value": 0, "unit": "weeks"}')
  RETURNING id INTO x1;
  BEGIN
    INSERT INTO public.document_type_versions (org_id, document_type_id, version_number, status, label, category_id, subject_types, allowed_formats)
    VALUES (c.org, t, 9, 'published', 'Forged', c.cat_c, ARRAY['child'], ARRAY['pdf']);
    RAISE EXCEPTION 'CASE 2 FAILED: a version was inserted already published';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  r := public.document_type_validate(c.org, x1, NULL);
  IF (r ->> 'valid')::boolean OR jsonb_array_length(r -> 'problems') < 2 THEN
    RAISE EXCEPTION 'CASE 2 FAILED: an invalid validity policy passed validation (%)', r;
  END IF;
  BEGIN
    PERFORM public.document_type_publish(c.org, t, x1, NULL, NULL);
    RAISE EXCEPTION 'CASE 2 FAILED: an unvalidated draft was published';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.document_type_versions SET validity_policy = '{"kind": "duration", "value": 12, "unit": "months", "warning_days": [30, 7]}' WHERE id = x1;
  r := public.document_type_validate(c.org, x1, NULL);
  IF NOT (r ->> 'valid')::boolean THEN RAISE EXCEPTION 'CASE 2 FAILED: a valid draft did not validate (%)', r; END IF;
  BEGIN
    PERFORM public.document_type_publish(c.org, t, x1, gen_random_uuid(), NULL);
    RAISE EXCEPTION 'CASE 2 FAILED: a stale compare-and-swap was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  r := public.document_type_publish(c.org, t, x1, NULL, NULL);
  IF (SELECT published_version_id FROM public.document_types WHERE id = t) <> x1 THEN RAISE EXCEPTION 'CASE 2 FAILED: version 1 not current'; END IF;
  BEGIN
    UPDATE public.document_type_versions SET label = 'Changed after publish' WHERE id = x1;
    RAISE EXCEPTION 'CASE 2 FAILED: a published version changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.document_types SET published_version_id = NULL WHERE id = t;
    RAISE EXCEPTION 'CASE 2 FAILED: the published pointer moved outside the publish function';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.document_types SET key = 'd3_inv_renamed' WHERE id = t;
    RAISE EXCEPTION 'CASE 2 FAILED: a type key changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.document_type_versions (org_id, document_type_id, version_number, label, category_id, subject_types, allowed_formats, default_sensitivity)
  VALUES (c.org, t, 2, 'Inv type renamed', c.cat_c, ARRAY['child', 'household'], ARRAY['pdf', 'png'], 'personal_identity') RETURNING id INTO x2;
  r := public.document_type_validate(c.org, x2, NULL);
  r := public.document_type_publish(c.org, t, x2, x1, NULL);
  IF (SELECT status FROM public.document_type_versions WHERE id = x1) <> 'superseded'
     OR (SELECT status FROM public.document_type_versions WHERE id = x2) <> 'published'
     OR (SELECT key FROM public.document_types WHERE id = t) <> 'd3_inv_type' THEN
    RAISE EXCEPTION 'CASE 2 FAILED: version 2 did not supersede version 1 under the same identity';
  END IF;
  UPDATE d3_ctx SET type_id = t, v1 = x1, v2 = x2;
  RAISE NOTICE 'CASE 2 PASS lifecycle, validation, compare-and-swap, immutability and stable identity across revisions';
END $$;

-- CASE 3 — sensitivity policy: anti-downgrade, the medical floor, an edited validated draft returns to draft.
DO $$
DECLARE c record; v3 uuid; mt uuid; mv uuid; r jsonb;
BEGIN
  SELECT * INTO c FROM d3_ctx;
  INSERT INTO public.document_type_versions (org_id, document_type_id, version_number, label, category_id, subject_types, allowed_formats, default_sensitivity)
  VALUES (c.org, c.type_id, 3, 'Lowered', c.cat_c, ARRAY['child'], ARRAY['pdf'], 'standard') RETURNING id INTO v3;
  r := public.document_type_validate(c.org, v3, NULL);
  IF (r ->> 'valid')::boolean OR NOT (r -> 'problems') @> '[{"code": "sensitivity_lowering"}]' THEN
    RAISE EXCEPTION 'CASE 3 FAILED: a lowering of the default sensitivity validated (%)', r;
  END IF;
  UPDATE public.document_type_versions SET default_sensitivity = 'restricted' WHERE id = v3;
  r := public.document_type_validate(c.org, v3, NULL);
  IF NOT (r ->> 'valid')::boolean THEN RAISE EXCEPTION 'CASE 3 FAILED: personal_identity to restricted refused (%)', r; END IF;
  UPDATE public.document_type_versions SET label = 'Lowered, relabelled' WHERE id = v3;
  IF (SELECT status FROM public.document_type_versions WHERE id = v3) <> 'draft' THEN
    RAISE EXCEPTION 'CASE 3 FAILED: an edited validated draft stayed validated';
  END IF;
  SELECT t.id, t.published_version_id INTO mt, mv FROM public.document_types t WHERE t.org_id = c.org AND t.key = 'immunization_record';
  INSERT INTO public.document_type_versions (org_id, document_type_id, version_number, label, category_id, subject_types, allowed_formats, default_sensitivity)
  VALUES (c.org, mt, (SELECT max(version_number) + 1 FROM public.document_type_versions WHERE document_type_id = mt), 'Immunization', c.cat_a,
          ARRAY['child'], ARRAY['pdf'], 'standard') RETURNING id INTO v3;
  r := public.document_type_validate(c.org, v3, NULL);
  IF (r ->> 'valid')::boolean OR NOT (r -> 'problems') @> '[{"code": "medical_type_floor"}]' THEN
    RAISE EXCEPTION 'CASE 3 FAILED: a medical type validated below medical (%)', r;
  END IF;
  RAISE NOTICE 'CASE 3 PASS no downgrade of a type default; medical floor; edited drafts must be validated again';
END $$;

-- CASE 4 — new documents take the type default, raise-only; a re-typed document takes the medical floor; existing
-- documents are never lowered.
DO $$
DECLARE c record; d uuid; e uuid;
BEGIN
  SELECT * INTO c FROM d3_ctx;
  INSERT INTO public.documents (org_id, entity_type, entity_id, doc_type, title, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
  VALUES (c.org, 'customer_member', c.child, 'd3_inv_type', 'd3 inv doc', 'application/pdf', 10, repeat('a', 64), 'org_documents',
          c.org::text || '/customer_member/' || c.child::text || '/d3-inv.pdf', 'uploaded') RETURNING id INTO d;
  IF (SELECT sensitivity FROM public.documents WHERE id = d) <> 'personal_identity' THEN
    RAISE EXCEPTION 'CASE 4 FAILED: a new document did not take its type default (%)', (SELECT sensitivity FROM public.documents WHERE id = d);
  END IF;
  INSERT INTO public.documents (org_id, entity_type, entity_id, doc_type, title, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
  VALUES (c.org, 'customer_member', c.child, 'enrollment_document', 'd3 inv plain', 'application/pdf', 10, repeat('b', 64), 'org_documents',
          c.org::text || '/customer_member/' || c.child::text || '/d3-plain.pdf', 'uploaded') RETURNING id INTO e;
  IF (SELECT sensitivity FROM public.documents WHERE id = e) <> 'standard' THEN RAISE EXCEPTION 'CASE 4 FAILED: a standard type raised a document'; END IF;
  UPDATE public.documents SET doc_type = 'physical' WHERE id = e;
  IF (SELECT sensitivity FROM public.documents WHERE id = e) <> 'medical' THEN
    RAISE EXCEPTION 'CASE 4 FAILED: re-typing to a medical type left the declared class below medical (D2 gap)';
  END IF;
  UPDATE public.documents SET doc_type = 'enrollment_document' WHERE id = e;
  IF (SELECT sensitivity FROM public.documents WHERE id = e) <> 'medical' THEN
    RAISE EXCEPTION 'CASE 4 FAILED: re-typing to a standard type lowered the declared class';
  END IF;
  RAISE NOTICE 'CASE 4 PASS type default applied to new documents raise-only; re-typing raises, never lowers';
END $$;

-- CASE 5 — deletion only when unused; archive keeps identity.
DO $$
DECLARE c record; u uuid;
BEGIN
  SELECT * INTO c FROM d3_ctx;
  BEGIN
    DELETE FROM public.document_types WHERE id = c.type_id;
    RAISE EXCEPTION 'CASE 5 FAILED: a type a document used was deleted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.document_categories WHERE id = c.cat_c;
    RAISE EXCEPTION 'CASE 5 FAILED: a category a type used was deleted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.document_categories SET status = 'archived' WHERE id = c.cat_c;
    RAISE EXCEPTION 'CASE 5 FAILED: a category an active type is filed under was archived';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.document_types SET status = 'archived' WHERE id = c.type_id;
  IF (SELECT document_type_default_sensitivity(c.org, 'd3_inv_type')) IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 5 FAILED: an archived type still applies its default';
  END IF;
  UPDATE public.document_categories SET status = 'archived' WHERE id = c.cat_c;
  INSERT INTO public.document_types (org_id, key) VALUES (c.org, 'd3_inv_unused') RETURNING id INTO u;
  DELETE FROM public.document_types WHERE id = u;
  DELETE FROM public.document_categories WHERE id = c.foreign_cat;
  RAISE NOTICE 'CASE 5 PASS used types and categories archive, never delete; unused ones delete';
END $$;

-- CASE 6 — clients reach none of it.
DO $$
DECLARE c record; n int;
BEGIN
  SELECT * INTO c FROM d3_ctx;
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.document_types;
    RAISE EXCEPTION 'CASE 6 FAILED: authenticated read document_types';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO n FROM public.document_categories;
    RAISE EXCEPTION 'CASE 6 FAILED: anon read document_categories';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.document_type_publish(c.org, c.type_id, c.v2, c.v2, NULL);
    RAISE EXCEPTION 'CASE 6 FAILED: authenticated ran document_type_publish';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'CASE 6 PASS authenticated and anon reach no D3 table or function';
END $$;

-- CASE 7 — the sensitive-read capabilities: catalogued, granted to admin roles only, carried by the new-org seed.
DO $$
DECLARE v_src text;
BEGIN
  IF (SELECT count(*) FROM public.permission_definitions WHERE key IN ('documents.identity.read', 'documents.restricted.read') AND is_active) <> 2 THEN
    RAISE EXCEPTION 'CASE 7 FAILED: the two keys are not catalogued';
  END IF;
  IF EXISTS (SELECT 1 FROM public.role_permission_grants WHERE permission_key IN ('documents.identity.read', 'documents.restricted.read') AND allowed AND role_key <> 'admin') THEN
    RAISE EXCEPTION 'CASE 7 FAILED: a non-admin role holds a sensitive-read key';
  END IF;
  IF EXISTS (SELECT 1 FROM public.role_definitions rd WHERE rd.role_key = 'admin' AND rd.is_active AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g WHERE g.org_id = rd.org_id AND g.role_key = 'admin' AND g.permission_key = 'documents.restricted.read' AND g.allowed)) THEN
    RAISE EXCEPTION 'CASE 7 FAILED: an admin role lacks documents.restricted.read';
  END IF;
  v_src := pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure);
  IF strpos(substr(v_src, strpos(v_src, 'W12:OPS-GRANTS:BEGIN')), '''documents.restricted.read''') > 0
     AND strpos(substr(v_src, strpos(v_src, 'W12:OPS-GRANTS:BEGIN')), '''documents.restricted.read''') < strpos(substr(v_src, strpos(v_src, 'W12:OPS-GRANTS:BEGIN')), 'W12:OPS-GRANTS:END') THEN
    RAISE EXCEPTION 'CASE 7 FAILED: the new-org seed grants ops a sensitive-read key';
  END IF;
  RAISE NOTICE 'CASE 7 PASS keys catalogued, admin-only, and not in the ops seed';
END $$;

SELECT 'vac_rollback_test_reached_end';
