-- Publishing the same effective draft twice must not mint a second immutable revision.
--
-- Observed during Firefly certification: publishing an unchanged draft produced revision 1, and
-- retrying the identical request produced revision 2 with a byte-identical payload. The runtime
-- projection was unaffected — the second revision was pure noise in an append-only history that
-- exists to be trustworthy evidence. History should record what CHANGED, not how many times a
-- button was pressed.
--
-- IDENTITY. The narrowest fact that proves "this exact effective draft is already published from
-- this publication lineage" is the pair:
--
--     payload_checksum          WHAT would be published
--     published_from_revision_id WHICH publication it would succeed
--
-- Not timestamps, not draft ids, not request ids — those all differ between two attempts that mean
-- the same thing. `base_revision_id` on the draft cannot serve alone, because publishing REBASES
-- the draft onto what it just published, so by the time a retry arrives the draft's base already
-- equals the new revision. Recording the predecessor ON THE REVISION is what makes the lineage
-- durable enough to compare against.
--
-- WHY A ROLLBACK STILL WORKS. Republishing an earlier payload forward produces the same checksum
-- as some historical revision but a DIFFERENT predecessor (whatever is live now), so the pair is
-- distinct and the insert is allowed. A blanket unique constraint on checksum alone would have
-- broken rollback, which is why the predecessor is part of the identity rather than a nicety.

-- ---------------------------------------------------------------------------
-- Lineage column
-- ---------------------------------------------------------------------------

ALTER TABLE public.business_process_revisions
    ADD COLUMN IF NOT EXISTS published_from_revision_id uuid
        REFERENCES public.business_process_revisions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.business_process_revisions.published_from_revision_id IS
    'The revision that was live when this one was published (NULL for the first). With payload_checksum this is the publication identity that makes republishing idempotent.';

-- Backfill: each revision succeeded the one before it for the same subject.
--
-- This deliberately leaves any historical duplicate in place. Firefly''s certification produced two
-- revisions with identical payloads; after backfill they carry DIFFERENT predecessors (NULL and
-- revision 1), so they remain distinct under the new index. Historical evidence stays historical
-- evidence — the fix stops new duplicates, it does not rewrite the past.
UPDATE public.business_process_revisions r
SET published_from_revision_id = prev.id
FROM (
    SELECT
        id,
        org_id,
        department_id,
        revision_number,
        lag(id) OVER (PARTITION BY org_id, department_id ORDER BY revision_number) AS prev_id
    FROM public.business_process_revisions
) ordered
JOIN public.business_process_revisions prev ON prev.id = ordered.prev_id
WHERE r.id = ordered.id
  AND r.published_from_revision_id IS NULL;

-- ---------------------------------------------------------------------------
-- The invariant — enforced by the DATABASE, not by application checks
-- ---------------------------------------------------------------------------
--
-- Two concurrent requests both pass an application-level "is this already published?" test before
-- either has written, so application checking alone cannot prevent duplicates. This index is what
-- makes the second writer lose.
--
-- COALESCE, not a plain UNIQUE: in PostgreSQL two NULLs are distinct by default, so a bare unique
-- constraint would still let two concurrent FIRST publishes (predecessor NULL) both succeed —
-- exactly the case with no earlier revision to compare against. The sentinel closes that hole
-- without requiring NULLS NOT DISTINCT (PG15+).
CREATE UNIQUE INDEX IF NOT EXISTS business_process_revisions_publication_identity_unique
    ON public.business_process_revisions (
        org_id,
        department_id,
        payload_checksum,
        coalesce(published_from_revision_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

COMMENT ON INDEX public.business_process_revisions_publication_identity_unique IS
    'One immutable revision per (subject, payload, predecessor). Makes republishing an unchanged draft idempotent under concurrency; still permits rollback, which republishes an old payload from a new predecessor.';

-- ---------------------------------------------------------------------------
-- Publish — short-circuit before writing anything
-- ---------------------------------------------------------------------------

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
    UPDATE public.departments
    SET metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1}', v_revision.payload, true),
        updated_at = now()
    WHERE id = p_department_id AND org_id = p_org_id;

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

-- ---------------------------------------------------------------------------
-- Rollback — same lineage column, same convergence
-- ---------------------------------------------------------------------------
--
-- Rollback republishes an old payload forward. It must record its predecessor too, or its rows
-- would carry a NULL predecessor and collide with the first revision under the new index.
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

    -- Rolling back to what is already live is a no-op, for the same reason a duplicate publish is.
    IF v_current_revision_id IS NOT DISTINCT FROM p_target_revision_id THEN
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
            'revision_id', v_target.id,
            'revision_number', v_target.revision_number,
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
    UPDATE public.departments
    SET metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1}', v_revision.payload, true),
        updated_at = now()
    WHERE id = p_department_id AND org_id = p_org_id;

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
