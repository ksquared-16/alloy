-- =============================================================================
-- Restore the guarded projection write to the Business Process publication RPCs
-- =============================================================================
-- REGRESSION REPAIRED
--
-- 20260730130000 introduced `guard_lifecycle_builder_projection()`, which makes
-- `departments.metadata.lifecycle_builder_v1` publication-owned, and taught the
-- publish/rollback RPCs to hold the transaction-local capability token around
-- their projection UPDATE.
--
-- 20260807090000 then added publish idempotency by CREATE OR REPLACE on both
-- RPCs and did not carry those two calls forward. From that migration until this
-- one, BOTH `publish_business_process_revision_v1` and
-- `rollback_business_process_to_revision_v1` were blocked by the very guard they
-- are supposed to satisfy — publishing any Business Process configuration failed
-- with "lifecycle_builder_v1 is publication-owned; direct writes are not
-- permitted". Found during Search Platform V2 certification, when seeding a
-- disposable tenant could not publish a process configuration.
--
-- This migration is forward-only. It re-creates both functions with the CURRENT
-- idempotency bodies from 20260807090000, unchanged except for restoring
-- `begin_lifecycle_projection_write('publish')` / `end_lifecycle_projection_write()`
-- around the projection UPDATE.
--
-- Deliberately NOT changed:
--   * the guard stays fail-closed for direct/unauthorized writes
--   * no application caller acquires the token; only these RPCs do
--   * the token is transaction-local and released immediately, so it cannot leak
--   * signatures, authorization checks and idempotency semantics are identical
--
-- Safe to replay: CREATE OR REPLACE, and safe on databases running the broken
-- version because it only adds the token calls.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.publish_business_process_revision_v1(
    p_org_id uuid,
    p_department_id uuid,
    p_actor_user_id uuid,
    p_payload_checksum text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_department public.departments%ROWTYPE;
    v_draft public.business_process_drafts%ROWTYPE;
    v_revision public.business_process_revisions%ROWTYPE;
    v_publication public.configuration_publications%ROWTYPE;
    v_current_revision_id uuid;
    v_current_revision_number integer;
    v_current_checksum text;
    v_existing public.business_process_revisions%ROWTYPE;
    v_existing_publication public.configuration_publications%ROWTYPE;
    v_revision_number integer;
    v_event_id uuid;
    v_metadata jsonb;
BEGIN
    IF nullif(btrim(p_payload_checksum), '') IS NULL THEN
        RAISE EXCEPTION 'business_process_publish_checksum_required' USING ERRCODE = '22023';
    END IF;

    -- Serializes concurrent publishes for this subject and pins the projection target.
    SELECT * INTO v_department
    FROM public.departments
    WHERE id = p_department_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'business_process_department_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_draft
    FROM public.business_process_drafts
    WHERE department_id = p_department_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'business_process_draft_not_found' USING ERRCODE = 'P0002';
    END IF;

    -- Law 3 boundary: published configuration may not be invalid.
    IF v_draft.draft_status <> 'validated'
       OR jsonb_array_length(v_draft.validation_errors) > 0 THEN
        RAISE EXCEPTION 'business_process_draft_not_validated' USING ERRCODE = '23514';
    END IF;

    SELECT cp.revision_id, cp.revision_number, cp.payload_checksum
    INTO v_current_revision_id, v_current_revision_number, v_current_checksum
    FROM public.configuration_publications cp
    WHERE cp.org_id = p_org_id
      AND cp.domain_key = 'business_process'
      AND cp.subject_id = p_department_id
    ORDER BY cp.revision_number DESC
    LIMIT 1;

    -- Law 4 boundary: the draft must have been opened against the current publication.
    -- Checked BEFORE the no-op below so a stale draft is still refused rather than quietly
    -- reported as already-published.
    IF v_draft.base_revision_id IS DISTINCT FROM v_current_revision_id THEN
        RAISE EXCEPTION
            'business_process_draft_stale (current_revision=% attempted_base=%)',
            coalesce(v_current_revision_id::text, 'none'),
            coalesce(v_draft.base_revision_id::text, 'none')
            USING ERRCODE = '40001',
                  HINT = 'Reload the configuration and reapply your changes; a newer revision was published.';
    END IF;

    -- ALREADY PUBLISHED. What the draft would publish is byte-identical to what is live, from this
    -- same lineage. Return the existing identity and write NOTHING: no revision, no publication, no
    -- audit event, and above all no projection write — re-materializing the projection would churn
    -- `departments.updated_at` and invalidate caches for a change that did not happen.
    IF v_current_revision_id IS NOT NULL
       AND v_current_checksum IS NOT DISTINCT FROM btrim(p_payload_checksum) THEN
        SELECT * INTO v_existing
        FROM public.business_process_revisions
        WHERE id = v_current_revision_id;

        SELECT * INTO v_existing_publication
        FROM public.configuration_publications
        WHERE org_id = p_org_id
          AND domain_key = 'business_process'
          AND subject_id = p_department_id
          AND revision_id = v_current_revision_id
        ORDER BY revision_number DESC
        LIMIT 1;

        RETURN jsonb_build_object(
            'department_id', p_department_id,
            'revision_id', v_existing.id,
            'revision_number', v_existing.revision_number,
            'publication_id', v_existing_publication.id,
            'audit_event_id', v_existing_publication.audit_event_id,
            'published_at', v_existing_publication.published_at,
            -- The caller can tell "already live" from "just published" without diffing state.
            'already_published', true
        );
    END IF;

    SELECT coalesce(max(revision_number), 0) + 1 INTO v_revision_number
    FROM public.business_process_revisions
    WHERE org_id = p_org_id AND department_id = p_department_id;

    BEGIN
        INSERT INTO public.business_process_revisions (
            org_id, department_id, revision_number, payload, payload_checksum,
            source_draft_id, published_by, published_from_revision_id
        )
        VALUES (
            p_org_id, p_department_id, v_revision_number, v_draft.payload, btrim(p_payload_checksum),
            v_draft.id, p_actor_user_id, v_current_revision_id
        )
        RETURNING * INTO v_revision;
    EXCEPTION WHEN unique_violation THEN
        -- CONCURRENCY BACKSTOP. Another transaction published this exact identity while this one was
        -- in flight. Converge on theirs rather than failing the operator: the outcome they asked for
        -- is the outcome that exists.
        SELECT * INTO v_existing
        FROM public.business_process_revisions
        WHERE org_id = p_org_id
          AND department_id = p_department_id
          AND payload_checksum = btrim(p_payload_checksum)
          AND coalesce(published_from_revision_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = coalesce(v_current_revision_id, '00000000-0000-0000-0000-000000000000'::uuid);

        SELECT * INTO v_existing_publication
        FROM public.configuration_publications
        WHERE org_id = p_org_id
          AND domain_key = 'business_process'
          AND subject_id = p_department_id
          AND revision_id = v_existing.id
        ORDER BY revision_number DESC
        LIMIT 1;

        RETURN jsonb_build_object(
            'department_id', p_department_id,
            'revision_id', v_existing.id,
            'revision_number', v_existing.revision_number,
            'publication_id', v_existing_publication.id,
            'audit_event_id', v_existing_publication.audit_event_id,
            'published_at', v_existing_publication.published_at,
            'already_published', true
        );
    END;

    INSERT INTO public.workflow_events (
        org_id, event_type, entity_type, entity_id, action_type, payload, occurred_at
    )
    VALUES (
        p_org_id,
        'configuration.business_process.published',
        'department',
        p_department_id,
        'publish',
        jsonb_build_object(
            'domain_key', 'business_process',
            'department_id', p_department_id,
            'revision_id', v_revision.id,
            'revision_number', v_revision.revision_number,
            'payload_checksum', v_revision.payload_checksum,
            'previous_revision_number', v_current_revision_number,
            'actor_user_id', p_actor_user_id
        ),
        now()
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.configuration_publications (
        org_id, domain_key, subject_id, revision_id, revision_number,
        payload_checksum, published_by, published_at, audit_event_id
    )
    VALUES (
        p_org_id, 'business_process', p_department_id, v_revision.id, v_revision.revision_number,
        v_revision.payload_checksum, p_actor_user_id, v_revision.published_at, v_event_id
    )
    RETURNING * INTO v_publication;

    -- Runtime projection, same transaction: publication and runtime can never disagree.
    v_metadata := coalesce(v_department.metadata, '{}'::jsonb);
    -- GUARDED WRITE. `departments.metadata.lifecycle_builder_v1` is publication-owned
    -- and `guard_lifecycle_builder_projection()` rejects any write without this
    -- transaction-local capability token. It is acquired for exactly the projection
    -- UPDATE below and released immediately after, so publishing cannot leave a
    -- standing bypass for later statements in the same transaction.
    --
    -- DO NOT REMOVE when re-creating this function. Migration 20260807090000 added
    -- publish idempotency by CREATE OR REPLACE and silently dropped these two calls,
    -- which left BOTH publish and rollback blocked by the platform's own guard from
    -- 2026-08-07 until this migration. A regression test now asserts the token is
    -- present in pg_get_functiondef for both RPCs.
    PERFORM public.begin_lifecycle_projection_write('publish');
    UPDATE public.departments
    SET metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1}', v_revision.payload, true),
        updated_at = now()
    WHERE id = p_department_id AND org_id = p_org_id;
    PERFORM public.end_lifecycle_projection_write();

    -- Rebase the draft onto what was just published.
    UPDATE public.business_process_drafts
    SET base_revision_id = v_revision.id,
        updated_by = p_actor_user_id,
        updated_at = now()
    WHERE id = v_draft.id;

    RETURN jsonb_build_object(
        'department_id', p_department_id,
        'revision_id', v_revision.id,
        'revision_number', v_revision.revision_number,
        'publication_id', v_publication.id,
        'audit_event_id', v_event_id,
        'published_at', v_publication.published_at,
        'already_published', false
    );
END;
$function$;


CREATE OR REPLACE FUNCTION public.rollback_business_process_to_revision_v1(
    p_org_id uuid,
    p_department_id uuid,
    p_target_revision_id uuid,
    p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_department public.departments%ROWTYPE;
    v_target public.business_process_revisions%ROWTYPE;
    v_revision public.business_process_revisions%ROWTYPE;
    v_publication public.configuration_publications%ROWTYPE;
    v_current_revision_id uuid;
    v_current_checksum text;
    v_existing public.business_process_revisions%ROWTYPE;
    v_existing_publication public.configuration_publications%ROWTYPE;
    v_revision_number integer;
    v_event_id uuid;
    v_metadata jsonb;
BEGIN
    SELECT * INTO v_department
    FROM public.departments
    WHERE id = p_department_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'business_process_department_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_target
    FROM public.business_process_revisions
    WHERE id = p_target_revision_id AND org_id = p_org_id AND department_id = p_department_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'business_process_revision_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT cp.revision_id INTO v_current_revision_id
    FROM public.configuration_publications cp
    WHERE cp.org_id = p_org_id
      AND cp.domain_key = 'business_process'
      AND cp.subject_id = p_department_id
    ORDER BY cp.revision_number DESC
    LIMIT 1;

    -- Rolling back to CONTENT that is already live is a no-op, for the same reason a duplicate
    -- publish is — and the test must be the same one publish uses.
    --
    -- Comparing revision IDS is not enough: after a rollback, the live revision is a NEW row that
    -- CARRIES the target's payload, so `target != current` while the content is identical. Rolling
    -- back to the same target twice then appended an endless run of revisions with byte-identical
    -- payloads. Comparing the CHECKSUM makes the rule "is this content already live?", which is the
    -- question both operations actually ask.
    SELECT cp.payload_checksum INTO v_current_checksum
    FROM public.configuration_publications cp
    WHERE cp.org_id = p_org_id
      AND cp.domain_key = 'business_process'
      AND cp.subject_id = p_department_id
    ORDER BY cp.revision_number DESC
    LIMIT 1;

    IF v_current_revision_id IS NOT NULL
       AND v_current_checksum IS NOT DISTINCT FROM v_target.payload_checksum THEN
        SELECT * INTO v_existing_publication
        FROM public.configuration_publications
        WHERE org_id = p_org_id
          AND domain_key = 'business_process'
          AND subject_id = p_department_id
          AND revision_id = v_current_revision_id
        ORDER BY revision_number DESC
        LIMIT 1;

        SELECT * INTO v_existing
        FROM public.business_process_revisions
        WHERE id = v_current_revision_id;

        RETURN jsonb_build_object(
            'department_id', p_department_id,
            'revision_id', v_existing.id,
            'revision_number', v_existing.revision_number,
            'rolled_back_from_revision_id', v_target.id,
            'publication_id', v_existing_publication.id,
            'audit_event_id', v_existing_publication.audit_event_id,
            'published_at', v_existing_publication.published_at,
            'already_published', true
        );
    END IF;

    SELECT coalesce(max(revision_number), 0) + 1 INTO v_revision_number
    FROM public.business_process_revisions
    WHERE org_id = p_org_id AND department_id = p_department_id;

    BEGIN
        INSERT INTO public.business_process_revisions (
            org_id, department_id, revision_number, payload, payload_checksum,
            rolled_back_from_revision_id, published_by, published_from_revision_id
        )
        VALUES (
            p_org_id, p_department_id, v_revision_number, v_target.payload, v_target.payload_checksum,
            v_target.id, p_actor_user_id, v_current_revision_id
        )
        RETURNING * INTO v_revision;
    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_existing
        FROM public.business_process_revisions
        WHERE org_id = p_org_id
          AND department_id = p_department_id
          AND payload_checksum = v_target.payload_checksum
          AND coalesce(published_from_revision_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = coalesce(v_current_revision_id, '00000000-0000-0000-0000-000000000000'::uuid);

        SELECT * INTO v_existing_publication
        FROM public.configuration_publications
        WHERE org_id = p_org_id
          AND domain_key = 'business_process'
          AND subject_id = p_department_id
          AND revision_id = v_existing.id
        ORDER BY revision_number DESC
        LIMIT 1;

        RETURN jsonb_build_object(
            'department_id', p_department_id,
            'revision_id', v_existing.id,
            'revision_number', v_existing.revision_number,
            'publication_id', v_existing_publication.id,
            'audit_event_id', v_existing_publication.audit_event_id,
            'published_at', v_existing_publication.published_at,
            'already_published', true
        );
    END;

    INSERT INTO public.workflow_events (
        org_id, event_type, entity_type, entity_id, action_type, payload, occurred_at
    )
    VALUES (
        p_org_id,
        'configuration.business_process.rolled_back',
        'department',
        p_department_id,
        'publish',
        jsonb_build_object(
            'domain_key', 'business_process',
            'department_id', p_department_id,
            'revision_id', v_revision.id,
            'revision_number', v_revision.revision_number,
            'rolled_back_from_revision_id', v_target.id,
            'rolled_back_from_revision_number', v_target.revision_number,
            'actor_user_id', p_actor_user_id
        ),
        now()
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.configuration_publications (
        org_id, domain_key, subject_id, revision_id, revision_number,
        payload_checksum, published_by, published_at, audit_event_id
    )
    VALUES (
        p_org_id, 'business_process', p_department_id, v_revision.id, v_revision.revision_number,
        v_revision.payload_checksum, p_actor_user_id, v_revision.published_at, v_event_id
    )
    RETURNING * INTO v_publication;

    v_metadata := coalesce(v_department.metadata, '{}'::jsonb);
    -- GUARDED WRITE. `departments.metadata.lifecycle_builder_v1` is publication-owned
    -- and `guard_lifecycle_builder_projection()` rejects any write without this
    -- transaction-local capability token. It is acquired for exactly the projection
    -- UPDATE below and released immediately after, so publishing cannot leave a
    -- standing bypass for later statements in the same transaction.
    --
    -- DO NOT REMOVE when re-creating this function. Migration 20260807090000 added
    -- publish idempotency by CREATE OR REPLACE and silently dropped these two calls,
    -- which left BOTH publish and rollback blocked by the platform's own guard from
    -- 2026-08-07 until this migration. A regression test now asserts the token is
    -- present in pg_get_functiondef for both RPCs.
    PERFORM public.begin_lifecycle_projection_write('publish');
    UPDATE public.departments
    SET metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1}', v_revision.payload, true),
        updated_at = now()
    WHERE id = p_department_id AND org_id = p_org_id;
    PERFORM public.end_lifecycle_projection_write();

    UPDATE public.business_process_drafts
    SET base_revision_id = v_revision.id,
        updated_by = p_actor_user_id,
        updated_at = now()
    WHERE department_id = p_department_id AND org_id = p_org_id;

    RETURN jsonb_build_object(
        'department_id', p_department_id,
        'revision_id', v_revision.id,
        'revision_number', v_revision.revision_number,
        -- Preserved from the original contract: callers may read which revision was restored.
        'rolled_back_from_revision_id', v_target.id,
        'publication_id', v_publication.id,
        'audit_event_id', v_event_id,
        'published_at', v_publication.published_at,
        'already_published', false
    );
END;
$function$;

