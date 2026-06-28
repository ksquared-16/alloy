# Schema — functions

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** 2026-06-28 · **Function count:** 2948

| Schema | Function | Return type | Security |
|--------|----------|-------------|----------|
| ` RETURNS jsonb` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| ` SECURITY DEFINER` | `` | — | — |
| ` SET search_path TO 'public'` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    cur jsonb;` | `` | — | — |
| `    v_old integer;` | `` | — | — |
| `    before_h text;` | `` | — | — |
| `    after_h text;` | `` | — | — |
| `    out_row jsonb;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    INTO cur` | `` | — | — |
| `    FROM public.work_units wu` | `` | — | — |
| `    WHERE wu.id = p_work_unit_id` | `` | — | — |
| `      AND wu.org_id = p_org_id` | `` | — | — |
| `    FOR UPDATE;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NOT FOUND THEN` | `` | — | — |
| `        RAISE EXCEPTION 'agent_v0:work_unit_not_found';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF v_old IS DISTINCT FROM p_expected_version THEN` | `` | — | — |
| `        RAISE EXCEPTION 'agent_v0:stale_queue_definition_version';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `public` | `` | — | — |
| `    UPDATE public.work_units` | `` | — | — |
| `    SET` | `` | — | — |
| `        queue_definition = p_queue_definition` | `` | — | — |
| `        updated_at = now()` | `` | — | — |
| `    WHERE id = p_work_unit_id` | `` | — | — |
| `      AND org_id = p_org_id;` | `` | — | — |
| `public` | `` | — | — |
| `    INSERT INTO public.agent_v0_proposals (` | `` | — | — |
| `        proposal_id` | `` | — | — |
| `        request_id` | `` | — | — |
| `        correlation_id` | `` | — | — |
| `        org_id` | `` | — | — |
| `        user_id` | `` | — | — |
| `        work_unit_id` | `` | — | — |
| `        intent_json` | `` | — | — |
| `        before_hash` | `` | — | — |
| `        after_hash` | `` | — | — |
| `    )` | `` | — | — |
| `    VALUES (` | `` | — | — |
| `        p_proposal_id` | `` | — | — |
| `        p_request_id` | `` | — | — |
| `        p_correlation_id` | `` | — | — |
| `        p_org_id` | `` | — | — |
| `        p_user_id` | `` | — | — |
| `        p_work_unit_id` | `` | — | — |
| `        p_intent_json` | `` | — | — |
| `        before_h` | `` | — | — |
| `        after_h` | `` | — | — |
| `    );` | `` | — | — |
| `public` | `` | — | — |
| `    INSERT INTO public.agent_v0_apply_audit (` | `` | — | — |
| `        result_id` | `` | — | — |
| `        proposal_id` | `` | — | — |
| `        org_id` | `` | — | — |
| `        user_id` | `` | — | — |
| `        work_unit_id` | `` | — | — |
| `        terminal_status` | `` | — | — |
| `        applied_queue_definition_version` | `` | — | — |
| `    )` | `` | — | — |
| `    VALUES (` | `` | — | — |
| `        p_result_id` | `` | — | — |
| `        p_proposal_id` | `` | — | — |
| `        p_org_id` | `` | — | — |
| `        p_user_id` | `` | — | — |
| `        p_work_unit_id` | `` | — | — |
| `        'success'` | `` | — | — |
| `    );` | `` | — | — |
| `public` | `` | — | — |
| `    SELECT to_jsonb(wu.*)` | `` | — | — |
| `    INTO out_row` | `` | — | — |
| `    FROM public.work_units wu` | `` | — | — |
| `    WHERE wu.id = p_work_unit_id;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN out_row;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS jsonb` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| ` SECURITY DEFINER` | `` | — | — |
| ` SET search_path TO 'public'` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    layout_id uuid;` | `` | — | — |
| `    cur jsonb;` | `` | — | — |
| `    v_old integer;` | `` | — | — |
| `    before_h text;` | `` | — | — |
| `    after_h text;` | `` | — | — |
| `    out_row jsonb;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.record_overview_layouts rol` | `` | — | — |
| `    WHERE rol.org_id = p_org_id` | `` | — | — |
| `      AND rol.entity_type = p_entity_type` | `` | — | — |
| `      AND rol.surface = p_surface` | `` | — | — |
| `    FOR UPDATE;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NOT FOUND THEN` | `` | — | — |
| `        IF p_expected_version IS DISTINCT FROM 0 THEN` | `` | — | — |
| `            RAISE EXCEPTION 'agent_v1:no_record_overview_layout_row';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `public` | `` | — | — |
| `public` | `` | — | — |
| `        RETURNING id INTO layout_id;` | `` | — | — |
| `public` | `` | — | — |
| `        cur := '{}'::jsonb;` | `` | — | — |
| `    ELSE` | `` | — | — |
| `        IF v_old IS DISTINCT FROM p_expected_version THEN` | `` | — | — |
| `            RAISE EXCEPTION 'agent_v1:stale_record_overview_layout_version';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `public` | `` | — | — |
| `public` | `` | — | — |
| `        UPDATE public.record_overview_layouts` | `` | — | — |
| `        SET` | `` | — | — |
| `            config = p_config` | `` | — | — |
| `            updated_at = now()` | `` | — | — |
| `        WHERE id = layout_id` | `` | — | — |
| `          AND org_id = p_org_id;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    INSERT INTO public.agent_v1_record_layout_proposals (` | `` | — | — |
| `        proposal_id` | `` | — | — |
| `        request_id` | `` | — | — |
| `        correlation_id` | `` | — | — |
| `        org_id` | `` | — | — |
| `        user_id` | `` | — | — |
| `        record_overview_layout_id` | `` | — | — |
| `        intent_json` | `` | — | — |
| `        before_hash` | `` | — | — |
| `        after_hash` | `` | — | — |
| `    )` | `` | — | — |
| `    VALUES (` | `` | — | — |
| `        p_proposal_id` | `` | — | — |
| `        p_request_id` | `` | — | — |
| `        p_correlation_id` | `` | — | — |
| `        p_org_id` | `` | — | — |
| `        p_user_id` | `` | — | — |
| `        layout_id` | `` | — | — |
| `        p_intent_json` | `` | — | — |
| `        before_h` | `` | — | — |
| `        after_h` | `` | — | — |
| `    );` | `` | — | — |
| `public` | `` | — | — |
| `    INSERT INTO public.agent_v1_record_layout_apply_audit (` | `` | — | — |
| `        result_id` | `` | — | — |
| `        proposal_id` | `` | — | — |
| `        org_id` | `` | — | — |
| `        user_id` | `` | — | — |
| `        record_overview_layout_id` | `` | — | — |
| `        terminal_status` | `` | — | — |
| `        applied_config_version` | `` | — | — |
| `    )` | `` | — | — |
| `    VALUES (` | `` | — | — |
| `        p_result_id` | `` | — | — |
| `        p_proposal_id` | `` | — | — |
| `        p_org_id` | `` | — | — |
| `        p_user_id` | `` | — | — |
| `        layout_id` | `` | — | — |
| `        'success'` | `` | — | — |
| `    );` | `` | — | — |
| `public` | `` | — | — |
| `    SELECT to_jsonb(rol.*)` | `` | — | — |
| `    INTO out_row` | `` | — | — |
| `    FROM public.record_overview_layouts rol` | `` | — | — |
| `    WHERE rol.id = layout_id;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN out_row;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS jsonb` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| ` SECURITY DEFINER` | `` | — | — |
| ` SET search_path TO 'public'` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    fd public.field_definitions%ROWTYPE;` | `` | — | — |
| `    v_lock timestamptz;` | `` | — | — |
| `    exp_ts timestamptz;` | `` | — | — |
| `    before_h text;` | `` | — | — |
| `    after_h text;` | `` | — | — |
| `    out_row jsonb;` | `` | — | — |
| `    before_vis jsonb;` | `` | — | — |
| `    after_vis jsonb;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT *` | `` | — | — |
| `    INTO fd` | `` | — | — |
| `    FROM public.field_definitions` | `` | — | — |
| `    WHERE id = p_field_definition_id` | `` | — | — |
| `      AND org_id = p_org_id` | `` | — | — |
| `    FOR UPDATE;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NOT FOUND THEN` | `` | — | — |
| `        RAISE EXCEPTION 'agent_v2:field_definition_not_found';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `public` | `` | — | — |
| `    IF v_lock IS NULL THEN` | `` | — | — |
| `        RAISE EXCEPTION 'agent_v2:field_definition_not_found';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    exp_ts := p_expected_updated_at::timestamptz;` | `` | — | — |
| `public` | `` | — | — |
| `    IF v_lock IS DISTINCT FROM exp_ts THEN` | `` | — | — |
| `        RAISE EXCEPTION 'agent_v2:stale_field_definition';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    before_vis := jsonb_build_object(` | `` | — | — |
| `    );` | `` | — | — |
| `public` | `` | — | — |
| `    after_vis := jsonb_build_object(` | `` | — | — |
| `    );` | `` | — | — |
| `public` | `` | — | — |
| `    UPDATE public.field_definitions` | `` | — | — |
| `    SET` | `` | — | — |
| `        is_visible_in_form = p_is_visible_in_form` | `` | — | — |
| `        is_visible_in_drawer = p_is_visible_in_drawer` | `` | — | — |
| `        is_visible_in_table = p_is_visible_in_table` | `` | — | — |
| `        is_visible_in_public_booking = p_is_visible_in_public_booking` | `` | — | — |
| `        updated_at = now()` | `` | — | — |
| `    WHERE id = p_field_definition_id` | `` | — | — |
| `      AND org_id = p_org_id;` | `` | — | — |
| `public` | `` | — | — |
| `    INSERT INTO public.agent_v2_field_visibility_proposals (` | `` | — | — |
| `        proposal_id` | `` | — | — |
| `        request_id` | `` | — | — |
| `        correlation_id` | `` | — | — |
| `        org_id` | `` | — | — |
| `        user_id` | `` | — | — |
| `        field_definition_id` | `` | — | — |
| `        intent_json` | `` | — | — |
| `        before_hash` | `` | — | — |
| `        after_hash` | `` | — | — |
| `    )` | `` | — | — |
| `    VALUES (` | `` | — | — |
| `        p_proposal_id` | `` | — | — |
| `        p_request_id` | `` | — | — |
| `        p_correlation_id` | `` | — | — |
| `        p_org_id` | `` | — | — |
| `        p_user_id` | `` | — | — |
| `        p_field_definition_id` | `` | — | — |
| `        p_intent_json` | `` | — | — |
| `        before_h` | `` | — | — |
| `        after_h` | `` | — | — |
| `    );` | `` | — | — |
| `public` | `` | — | — |
| `    INSERT INTO public.agent_v2_field_visibility_apply_audit (` | `` | — | — |
| `        result_id` | `` | — | — |
| `        proposal_id` | `` | — | — |
| `        org_id` | `` | — | — |
| `        user_id` | `` | — | — |
| `        field_definition_id` | `` | — | — |
| `        terminal_status` | `` | — | — |
| `        applied_updated_at` | `` | — | — |
| `    )` | `` | — | — |
| `    VALUES (` | `` | — | — |
| `        p_result_id` | `` | — | — |
| `        p_proposal_id` | `` | — | — |
| `        p_org_id` | `` | — | — |
| `        p_user_id` | `` | — | — |
| `        p_field_definition_id` | `` | — | — |
| `        'success'` | `` | — | — |
| `        (SELECT updated_at FROM public.field_definitions WHERE id = p_field_definition_id)` | `` | — | — |
| `    );` | `` | — | — |
| `public` | `` | — | — |
| `    SELECT to_jsonb(f.*)` | `` | — | — |
| `    INTO out_row` | `` | — | — |
| `    FROM public.field_definitions f` | `` | — | — |
| `    WHERE f.id = p_field_definition_id;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN out_row;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` LANGUAGE sql` | `` | — | — |
| ` STABLE SECURITY DEFINER` | `` | — | — |
| ` SET search_path TO 'public'` | `` | — | — |
| `AS $function$` | `` | — | — |
| `  WITH v AS (` | `` | — | — |
| `    SELECT id AS vertical_id` | `` | — | — |
| `    FROM public.verticals` | `` | — | — |
| `    WHERE slug = 'cleaning' AND is_active = true` | `` | — | — |
| `    LIMIT 1` | `` | — | — |
| `  )` | `` | — | — |
| `  prereq_vertical AS (` | `` | — | — |
| `    SELECT` | `` | — | — |
| `      'prerequisite'::text AS slice_kind` | `` | — | — |
| `      NULL::text AS service_key` | `` | — | — |
| `      NULL::text AS tier_key` | `` | — | — |
| `      NULL::text AS frequency_key` | `` | — | — |
| `      NULL::integer AS legacy_cents` | `` | — | — |
| `      NULL::integer AS matrix_cents` | `` | — | — |
| `      'cleaning_vertical_missing_or_inactive'::text AS detail` | `` | — | — |
| `    WHERE NOT EXISTS (SELECT 1 FROM public.verticals WHERE slug = 'cleaning' AND is_active = true)` | `` | — | — |
| `  )` | `` | — | — |
| `  prereq_service AS (` | `` | — | — |
| `    SELECT` | `` | — | — |
| `      'prerequisite'::text AS slice_kind` | `` | — | — |
| `      NULL::text AS service_key` | `` | — | — |
| `      NULL::text AS tier_key` | `` | — | — |
| `      NULL::text AS frequency_key` | `` | — | — |
| `      NULL::integer AS legacy_cents` | `` | — | — |
| `      NULL::integer AS matrix_cents` | `` | — | — |
| `      'no_active_standard_cleaning_pricing_service'::text AS detail` | `` | — | — |
| `    WHERE EXISTS (SELECT 1 FROM v)` | `` | — | — |
| `      AND NOT EXISTS (` | `` | — | — |
| `        SELECT 1` | `` | — | — |
| `        FROM public.pricing_services ps` | `` | — | — |
| `        INNER JOIN v ON v.vertical_id = ps.vertical_id` | `` | — | — |
| `        WHERE ps.is_active = true AND ps.service_key = 'standard_cleaning'` | `` | — | — |
| `      )` | `` | — | — |
| `  )` | `` | — | — |
| `  prereq_tiers AS (` | `` | — | — |
| `    SELECT` | `` | — | — |
| `      'prerequisite'::text AS slice_kind` | `` | — | — |
| `      NULL::text AS service_key` | `` | — | — |
| `      NULL::text AS tier_key` | `` | — | — |
| `      NULL::text AS frequency_key` | `` | — | — |
| `      NULL::integer AS legacy_cents` | `` | — | — |
| `      NULL::integer AS matrix_cents` | `` | — | — |
| `      'no_active_sqft_tiers_for_cleaning_vertical'::text AS detail` | `` | — | — |
| `    WHERE EXISTS (SELECT 1 FROM v)` | `` | — | — |
| `      AND EXISTS (` | `` | — | — |
| `        SELECT 1` | `` | — | — |
| `        FROM public.pricing_services ps` | `` | — | — |
| `        INNER JOIN v ON v.vertical_id = ps.vertical_id` | `` | — | — |
| `        WHERE ps.is_active = true AND ps.service_key = 'standard_cleaning'` | `` | — | — |
| `      )` | `` | — | — |
| `      AND NOT EXISTS (` | `` | — | — |
| `        SELECT 1` | `` | — | — |
| `        FROM public.pricing_square_footage_tiers st` | `` | — | — |
| `        INNER JOIN v ON v.vertical_id = st.vertical_id` | `` | — | — |
| `        WHERE st.is_active = true` | `` | — | — |
| `      )` | `` | — | — |
| `  )` | `` | — | — |
| `  svc AS (` | `` | — | — |
| `    SELECT` | `` | — | — |
| `      ps.id AS service_id` | `` | — | — |
| `      ps.service_key` | `` | — | — |
| `      ps.service_offering_id` | `` | — | — |
| `      so.org_id AS org_id` | `` | — | — |
| `      ps.vertical_id` | `` | — | — |
| `      (` | `` | — | — |
| `        SELECT pm.id` | `` | — | — |
| `        FROM public.pricing_modes pm` | `` | — | — |
| `        WHERE pm.org_id = so.org_id` | `` | — | — |
| `          AND pm.mode_key = 'initial'` | `` | — | — |
| `          AND pm.is_active = true` | `` | — | — |
| `          AND (pm.vertical_id IS NULL OR pm.vertical_id = ps.vertical_id)` | `` | — | — |
| `        LIMIT 1` | `` | — | — |
| `      ) AS initial_mode_id` | `` | — | — |
| `      (` | `` | — | — |
| `        SELECT pm.id` | `` | — | — |
| `        FROM public.pricing_modes pm` | `` | — | — |
| `        WHERE pm.org_id = so.org_id` | `` | — | — |
| `          AND pm.mode_key = 'recurring'` | `` | — | — |
| `          AND pm.is_active = true` | `` | — | — |
| `          AND (pm.vertical_id IS NULL OR pm.vertical_id = ps.vertical_id)` | `` | — | — |
| `        LIMIT 1` | `` | — | — |
| `      ) AS recurring_mode_id` | `` | — | — |
| `    FROM public.pricing_services ps` | `` | — | — |
| `    INNER JOIN v ON v.vertical_id = ps.vertical_id` | `` | — | — |
| `    LEFT JOIN public.service_offerings so ON so.id = ps.service_offering_id` | `` | — | — |
| `    WHERE ps.is_active = true` | `` | — | — |
| `      AND ps.service_key = 'standard_cleaning'` | `` | — | — |
| `  )` | `` | — | — |
| `  tier AS (` | `` | — | — |
| `    FROM public.pricing_square_footage_tiers st` | `` | — | — |
| `    INNER JOIN v ON v.vertical_id = st.vertical_id` | `` | — | — |
| `    WHERE st.is_active = true` | `` | — | — |
| `  )` | `` | — | — |
| `  first_clean AS (` | `` | — | — |
| `    SELECT` | `` | — | — |
| `      s.service_key` | `` | — | — |
| `      t.tier_key` | `` | — | — |
| `      f.amount_cents AS legacy_cents` | `` | — | — |
| `      m.amount_cents AS matrix_cents` | `` | — | — |
| `      CASE` | `` | — | — |
| `        WHEN s.service_offering_id IS NULL THEN 'service_missing_offering'` | `` | — | — |
| `        WHEN s.org_id IS NULL THEN 'service_offering_missing_org'` | `` | — | — |
| `        WHEN t.dimension_value_id IS NULL THEN 'tier_missing_dimension_value'` | `` | — | — |
| `        WHEN s.initial_mode_id IS NULL THEN 'missing_initial_pricing_mode'` | `` | — | — |
| `        WHEN f.amount_cents IS NULL AND m.amount_cents IS NULL THEN 'both_missing'` | `` | — | — |
| `        WHEN f.amount_cents IS NULL THEN 'missing_legacy'` | `` | — | — |
| `        WHEN m.amount_cents IS NULL THEN 'missing_matrix'` | `` | — | — |
| `        WHEN f.amount_cents IS DISTINCT FROM m.amount_cents THEN 'amount_mismatch'` | `` | — | — |
| `        ELSE NULL` | `` | — | — |
| `      END AS detail` | `` | — | — |
| `    FROM svc s` | `` | — | — |
| `    CROSS JOIN tier t` | `` | — | — |
| `    LEFT JOIN public.pricing_first_clean_prices f` | `` | — | — |
| `      ON f.vertical_id = t.vertical_id` | `` | — | — |
| `     AND f.service_id = s.service_id` | `` | — | — |
| `     AND f.sqft_tier_id = t.tier_id` | `` | — | — |
| `     AND f.is_active = true` | `` | — | — |
| `    LEFT JOIN public.pricing_matrix m` | `` | — | — |
| `      ON m.org_id = s.org_id` | `` | — | — |
| `     AND m.vertical_id = t.vertical_id` | `` | — | — |
| `     AND m.service_offering_id = s.service_offering_id` | `` | — | — |
| `     AND m.pricing_mode_id = s.initial_mode_id` | `` | — | — |
| `     AND m.pricing_dimension_value_id = t.dimension_value_id` | `` | — | — |
| `     AND m.service_plan_template_id IS NULL` | `` | — | — |
| `     AND m.currency = 'USD'` | `` | — | — |
| `     AND m.is_active = true` | `` | — | — |
| `  )` | `` | — | — |
| `  recurring AS (` | `` | — | — |
| `    SELECT` | `` | — | — |
| `      s.service_key` | `` | — | — |
| `      t.tier_key` | `` | — | — |
| `      pf.frequency_key` | `` | — | — |
| `      r.amount_cents AS legacy_cents` | `` | — | — |
| `      m.amount_cents AS matrix_cents` | `` | — | — |
| `      CASE` | `` | — | — |
| `        WHEN s.service_offering_id IS NULL THEN 'service_missing_offering'` | `` | — | — |
| `        WHEN s.org_id IS NULL THEN 'service_offering_missing_org'` | `` | — | — |
| `        WHEN t.dimension_value_id IS NULL THEN 'tier_missing_dimension_value'` | `` | — | — |
| `        WHEN s.recurring_mode_id IS NULL THEN 'missing_recurring_pricing_mode'` | `` | — | — |
| `        WHEN pf.service_plan_template_id IS NULL THEN 'frequency_missing_plan_template'` | `` | — | — |
| `        WHEN r.amount_cents IS NULL AND m.amount_cents IS NULL THEN 'both_missing'` | `` | — | — |
| `        WHEN r.amount_cents IS NULL THEN 'missing_legacy'` | `` | — | — |
| `        WHEN m.amount_cents IS NULL THEN 'missing_matrix'` | `` | — | — |
| `        WHEN r.amount_cents IS DISTINCT FROM m.amount_cents THEN 'amount_mismatch'` | `` | — | — |
| `        ELSE NULL` | `` | — | — |
| `      END AS detail` | `` | — | — |
| `    FROM svc s` | `` | — | — |
| `    CROSS JOIN tier t` | `` | — | — |
| `    INNER JOIN public.pricing_frequencies pf` | `` | — | — |
| `      ON pf.vertical_id = t.vertical_id` | `` | — | — |
| `     AND pf.is_active = true` | `` | — | — |
| `     AND pf.is_recurring = true` | `` | — | — |
| `    LEFT JOIN public.pricing_recurring_prices r` | `` | — | — |
| `      ON r.vertical_id = t.vertical_id` | `` | — | — |
| `     AND r.service_id = s.service_id` | `` | — | — |
| `     AND r.frequency_id = pf.id` | `` | — | — |
| `     AND r.sqft_tier_id = t.tier_id` | `` | — | — |
| `     AND r.is_active = true` | `` | — | — |
| `    LEFT JOIN public.pricing_matrix m` | `` | — | — |
| `      ON m.org_id = s.org_id` | `` | — | — |
| `     AND m.vertical_id = t.vertical_id` | `` | — | — |
| `     AND m.service_offering_id = s.service_offering_id` | `` | — | — |
| `     AND m.pricing_mode_id = s.recurring_mode_id` | `` | — | — |
| `     AND m.pricing_dimension_value_id = t.dimension_value_id` | `` | — | — |
| `     AND m.service_plan_template_id = pf.service_plan_template_id` | `` | — | — |
| `     AND m.currency = 'USD'` | `` | — | — |
| `     AND m.is_active = true` | `` | — | — |
| `  )` | `` | — | — |
| `  FROM prereq_vertical p` | `` | — | — |
| `  UNION ALL` | `` | — | — |
| `  FROM prereq_service p` | `` | — | — |
| `  UNION ALL` | `` | — | — |
| `  FROM prereq_tiers p` | `` | — | — |
| `  UNION ALL` | `` | — | — |
| `  FROM first_clean fc` | `` | — | — |
| `  WHERE fc.detail IS NOT NULL` | `` | — | — |
| `  UNION ALL` | `` | — | — |
| `  FROM recurring r` | `` | — | — |
| `  WHERE r.detail IS NOT NULL;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    UPDATE public.communication_threads` | `` | — | — |
| `    SET last_message_at = NEW.created_at` | `` | — | — |
| `        updated_at = NOW()` | `` | — | — |
| `    WHERE id = NEW.thread_id;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS SETOF communication_scheduled_sends` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF p_limit IS NULL OR p_limit < 1 THEN` | `` | — | — |
| `        RAISE EXCEPTION 'claim_due_communication_scheduled_sends: p_limit must be >= 1';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN QUERY` | `` | — | — |
| `    WITH picked AS (` | `` | — | — |
| `        SELECT css.id` | `` | — | — |
| `        FROM public.communication_scheduled_sends AS css` | `` | — | — |
| `        WHERE css.status = 'pending'::text` | `` | — | — |
| `          AND css.scheduled_for <= p_now` | `` | — | — |
| `          AND css.communication_message_id IS NULL` | `` | — | — |
| `          AND (p_org_id IS NULL OR css.org_id = p_org_id)` | `` | — | — |
| `        FOR UPDATE OF css SKIP LOCKED` | `` | — | — |
| `        LIMIT p_limit` | `` | — | — |
| `    )` | `` | — | — |
| `    updated AS (` | `` | — | — |
| `        UPDATE public.communication_scheduled_sends AS t` | `` | — | — |
| `        SET` | `` | — | — |
| `            status = 'claimed'::text` | `` | — | — |
| `            claim_token = gen_random_uuid()` | `` | — | — |
| `            claimed_at = p_now` | `` | — | — |
| `            updated_at = now()` | `` | — | — |
| `        FROM picked` | `` | — | — |
| `        WHERE t.id = picked.id` | `` | — | — |
| `        RETURNING t.*` | `` | — | — |
| `    )` | `` | — | — |
| `    SELECT * FROM updated;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS uuid` | `` | — | — |
| ` LANGUAGE sql` | `` | — | — |
| ` STABLE SECURITY DEFINER` | `` | — | — |
| ` SET search_path TO 'public'` | `` | — | — |
| `AS $function$` | `` | — | — |
| `  select` | `` | — | — |
| `    case` | `` | — | — |
| `      when (select count(*) from public.orgs) = 1` | `` | — | — |
| `        then (select id from public.orgs order by created_at asc limit 1)` | `` | — | — |
| `      else null` | `` | — | — |
| `    end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS integer` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `declare` | `` | — | — |
| `  cents int;` | `` | — | — |
| `begin` | `` | — | — |
| `  cents := round(base_cents * pct)::int;` | `` | — | — |
| `  return public.round_to_nearest_5_cents(cents);` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF TG_OP = 'DELETE' THEN` | `` | — | — |
| `        IF OLD.billable_source_type = 'enrollment_agreement' AND OLD.status <> 'draft' THEN` | `` | — | — |
| `                USING ERRCODE = '0A000';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        RETURN OLD;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    -- UPDATE: only governs posted childcare charges; drafts and job rows pass.` | `` | — | — |
| `    IF OLD.billable_source_type = 'enrollment_agreement' AND OLD.status <> 'draft' THEN` | `` | — | — |
| `        IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents` | `` | — | — |
| `            OR NEW.charge_category IS DISTINCT FROM OLD.charge_category` | `` | — | — |
| `            OR NEW.charge_type IS DISTINCT FROM OLD.charge_type` | `` | — | — |
| `            OR NEW.currency_code IS DISTINCT FROM OLD.currency_code` | `` | — | — |
| `            OR NEW.billable_source_type IS DISTINCT FROM OLD.billable_source_type` | `` | — | — |
| `            OR NEW.billable_source_id IS DISTINCT FROM OLD.billable_source_id` | `` | — | — |
| `            OR NEW.source_charge_id IS DISTINCT FROM OLD.source_charge_id` | `` | — | — |
| `            OR NEW.service_date IS DISTINCT FROM OLD.service_date THEN` | `` | — | — |
| `                USING ERRCODE = '0A000';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        -- Status may advance among posted states (driven by payments) but never` | `` | — | — |
| `                USING ERRCODE = '0A000';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `    person_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.entity_id;` | `` | — | — |
| `    IF opp_org IS NULL OR opp_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'communication_scheduled_sends: entity org mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    SELECT p.org_id INTO person_org FROM public.persons p WHERE p.id = NEW.recipient_person_id;` | `` | — | — |
| `    IF person_org IS NULL OR person_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'communication_scheduled_sends: recipient person org mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF TG_OP <> 'UPDATE' THEN` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF OLD.status = 'published'::text THEN` | `` | — | — |
| `        IF NEW.status = 'archived'::text AND OLD.status IS DISTINCT FROM NEW.status THEN` | `` | — | — |
| `            IF NEW.schema_json IS DISTINCT FROM OLD.schema_json` | `` | — | — |
| `                OR NEW.pdf_mapping_json IS DISTINCT FROM OLD.pdf_mapping_json` | `` | — | — |
| `                OR NEW.version_number IS DISTINCT FROM OLD.version_number` | `` | — | — |
| `                OR NEW.published_at IS DISTINCT FROM OLD.published_at` | `` | — | — |
| `                OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id` | `` | — | — |
| `                OR NEW.form_definition_id IS DISTINCT FROM OLD.form_definition_id` | `` | — | — |
| `                OR NEW.org_id IS DISTINCT FROM OLD.org_id` | `` | — | — |
| `                OR NEW.metadata IS DISTINCT FROM OLD.metadata` | `` | — | — |
| `            THEN` | `` | — | — |
| `                RAISE EXCEPTION 'form_definition_versions: only status may change when archiving a published version';` | `` | — | — |
| `            END IF;` | `` | — | — |
| `            RETURN NEW;` | `` | — | — |
| `        END IF;` | `` | — | — |
| `public` | `` | — | — |
| `        IF NEW.schema_json IS DISTINCT FROM OLD.schema_json` | `` | — | — |
| `            OR NEW.pdf_mapping_json IS DISTINCT FROM OLD.pdf_mapping_json` | `` | — | — |
| `            OR NEW.version_number IS DISTINCT FROM OLD.version_number` | `` | — | — |
| `            OR NEW.published_at IS DISTINCT FROM OLD.published_at` | `` | — | — |
| `            OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id` | `` | — | — |
| `            OR NEW.form_definition_id IS DISTINCT FROM OLD.form_definition_id` | `` | — | — |
| `            OR NEW.org_id IS DISTINCT FROM OLD.org_id` | `` | — | — |
| `            OR NEW.metadata IS DISTINCT FROM OLD.metadata` | `` | — | — |
| `            OR NEW.status IS DISTINCT FROM OLD.status` | `` | — | — |
| `        THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_definition_versions: published rows are immutable (publish -> archive only)';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF OLD.status = 'archived'::text THEN` | `` | — | — |
| `        -- Allow updated_at-only bumps from set_updated_at; all substantive columns frozen` | `` | — | — |
| `        IF NEW.id IS DISTINCT FROM OLD.id` | `` | — | — |
| `            OR NEW.form_definition_id IS DISTINCT FROM OLD.form_definition_id` | `` | — | — |
| `            OR NEW.org_id IS DISTINCT FROM OLD.org_id` | `` | — | — |
| `            OR NEW.version_number IS DISTINCT FROM OLD.version_number` | `` | — | — |
| `            OR NEW.status IS DISTINCT FROM OLD.status` | `` | — | — |
| `            OR NEW.schema_json IS DISTINCT FROM OLD.schema_json` | `` | — | — |
| `            OR NEW.pdf_mapping_json IS DISTINCT FROM OLD.pdf_mapping_json` | `` | — | — |
| `            OR NEW.published_at IS DISTINCT FROM OLD.published_at` | `` | — | — |
| `            OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id` | `` | — | — |
| `            OR NEW.metadata IS DISTINCT FROM OLD.metadata` | `` | — | — |
| `            OR NEW.created_at IS DISTINCT FROM OLD.created_at` | `` | — | — |
| `        THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_definition_versions: archived rows are immutable';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF TG_OP <> 'UPDATE' THEN` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF OLD.status IS DISTINCT FROM 'submitted'::text AND OLD.status IS DISTINCT FROM 'void'::text THEN` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.form_definition_version_id IS DISTINCT FROM OLD.form_definition_version_id` | `` | — | — |
| `        OR NEW.form_definition_id IS DISTINCT FROM OLD.form_definition_id` | `` | — | — |
| `    THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_submissions: finalized rows cannot change payload or form version linkage';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF public.form_submission_canonical_capture(NEW.payload) IS DISTINCT FROM public.form_submission_canonical_capture(OLD.payload)` | `` | — | — |
| `    THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_submissions: finalized rows cannot change captured answers';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF OLD.status = 'submitted'::text AND NEW.status IS DISTINCT FROM OLD.status THEN` | `` | — | — |
| `        IF NEW.status <> 'void'::text THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_submissions: submitted rows may only transition to void';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    ELSIF OLD.status = 'void'::text AND NEW.status IS DISTINCT FROM OLD.status THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_submissions: void rows cannot change status';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `  w_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `  IF NEW.work_unit_id IS NULL THEN` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  SELECT w.org_id INTO w_org` | `` | — | — |
| `  FROM public.work_units AS w` | `` | — | — |
| `  WHERE w.id = NEW.work_unit_id;` | `` | — | — |
| `public` | `` | — | — |
| `  IF w_org IS NULL THEN` | `` | — | — |
| `      USING ERRCODE = '23503';` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  IF NEW.org_id IS DISTINCT FROM w_org THEN` | `` | — | — |
| `    RAISE EXCEPTION 'jobs.org_id (%) must match work_units.org_id (%) for work_unit_id % (job org and work unit org must be the same tenant)'` | `` | — | — |
| `      USING ERRCODE = '23514';` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF NEW.entity_id IS NULL THEN` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.entity_id;` | `` | — | — |
| `    IF opp_org IS NULL OR opp_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'operational_tasks: entity org mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `  w_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `  IF NEW.work_unit_id IS NULL THEN` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  SELECT w.org_id INTO w_org` | `` | — | — |
| `  FROM public.work_units AS w` | `` | — | — |
| `  WHERE w.id = NEW.work_unit_id;` | `` | — | — |
| `public` | `` | — | — |
| `  IF w_org IS NULL THEN` | `` | — | — |
| `      USING ERRCODE = '23503';` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  IF NEW.org_id IS DISTINCT FROM w_org THEN` | `` | — | — |
| `    RAISE EXCEPTION 'opportunities.org_id (%) must match work_units.org_id (%) for work_unit_id % (opportunity org and work unit org must be the same tenant)'` | `` | — | — |
| `      USING ERRCODE = '23514';` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.entity_id;` | `` | — | — |
| `    IF opp_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF opp_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'task_assist_proposals: org_id does not match opportunity.org_id' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  if new.primary_contact_id is not null then` | `` | — | — |
| `    update public.contacts` | `` | — | — |
| `    set vendor_id = new.id` | `` | — | — |
| `        vendor_contact_role = 'primary'` | `` | — | — |
| `    where id = new.primary_contact_id;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  if p_job_number is null or p_job_number <= 1 then` | `` | — | — |
| `  elsif p_job_number between 2 and 10 then` | `` | — | — |
| `  else` | `` | — | — |
| `  end if;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS jsonb` | `` | — | — |
| ` LANGUAGE sql` | `` | — | — |
| ` IMMUTABLE` | `` | — | — |
| `AS $function$` | `` | — | — |
| `    SELECT jsonb_build_object(` | `` | — | — |
| `        'values'` | `` | — | — |
| `        'signatures'` | `` | — | — |
| `        'option_values_by_field_id'` | `` | — | — |
| `    );` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| ` SECURITY DEFINER` | `` | — | — |
| ` SET search_path TO 'public'` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `  v_vertical_id uuid;` | `` | — | — |
| `  v_service_id uuid;` | `` | — | — |
| `  v_sqft_tier_id uuid;` | `` | — | — |
| `  v_frequency_id uuid;` | `` | — | — |
| `  v_first integer;` | `` | — | — |
| `  v_recurring integer;` | `` | — | — |
| `  v_addons integer;` | `` | — | — |
| `  v_freq_label text;` | `` | — | — |
| `  v_discount_label text;` | `` | — | — |
| `  v_org_id uuid;` | `` | — | — |
| `  v_service_offering_id uuid;` | `` | — | — |
| `  v_dimension_value_id uuid;` | `` | — | — |
| `  v_initial_mode_id uuid;` | `` | — | — |
| `  v_recurring_mode_id uuid;` | `` | — | — |
| `  v_plan_template_id uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    out_vertical_slug := p_vertical_slug;` | `` | — | — |
| `    out_service_key := p_service_key;` | `` | — | — |
| `    out_sqft_key := p_sqft_key;` | `` | — | — |
| `    out_frequency_key := p_frequency_key;` | `` | — | — |
| `    first_clean_cents := NULL;` | `` | — | — |
| `    recurring_cents := NULL;` | `` | — | — |
| `    addons_total_cents := NULL;` | `` | — | — |
| `    total_first_visit_cents := NULL;` | `` | — | — |
| `    price_breakdown := 'Manual quote required';` | `` | — | — |
| `    is_manual_quote := true;` | `` | — | — |
| `    RETURN NEXT;` | `` | — | — |
| `    RETURN;` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  SELECT id INTO v_vertical_id` | `` | — | — |
| `  FROM public.verticals` | `` | — | — |
| `  WHERE slug = p_vertical_slug AND is_active = true` | `` | — | — |
| `  LIMIT 1;` | `` | — | — |
| `public` | `` | — | — |
| `  IF v_vertical_id IS NULL THEN` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  SELECT ps.id INTO v_service_id` | `` | — | — |
| `  FROM public.pricing_services ps` | `` | — | — |
| `  WHERE ps.vertical_id = v_vertical_id` | `` | — | — |
| `    AND ps.service_key = p_service_key` | `` | — | — |
| `    AND ps.is_active = true` | `` | — | — |
| `  LIMIT 1;` | `` | — | — |
| `public` | `` | — | — |
| `  IF v_service_id IS NULL THEN` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  FROM public.pricing_square_footage_tiers st` | `` | — | — |
| `  WHERE st.vertical_id = v_vertical_id` | `` | — | — |
| `    AND st.tier_key = p_sqft_key` | `` | — | — |
| `    AND st.is_active = true` | `` | — | — |
| `  LIMIT 1;` | `` | — | — |
| `public` | `` | — | — |
| `  IF v_sqft_tier_id IS NULL THEN` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  FROM public.pricing_services ps` | `` | — | — |
| `  LEFT JOIN public.service_offerings so ON so.id = ps.service_offering_id` | `` | — | — |
| `  WHERE ps.id = v_service_id` | `` | — | — |
| `  LIMIT 1;` | `` | — | — |
| `public` | `` | — | — |
| `  IF v_service_offering_id IS NULL OR v_org_id IS NULL THEN` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  IF v_dimension_value_id IS NULL THEN` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  SELECT pm.id INTO v_initial_mode_id` | `` | — | — |
| `  FROM public.pricing_modes pm` | `` | — | — |
| `  WHERE pm.org_id = v_org_id` | `` | — | — |
| `    AND pm.mode_key = 'initial'` | `` | — | — |
| `    AND pm.is_active = true` | `` | — | — |
| `    AND (pm.vertical_id IS NULL OR pm.vertical_id = v_vertical_id)` | `` | — | — |
| `  LIMIT 1;` | `` | — | — |
| `public` | `` | — | — |
| `  IF v_initial_mode_id IS NULL THEN` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  SELECT pm.id INTO v_recurring_mode_id` | `` | — | — |
| `  FROM public.pricing_modes pm` | `` | — | — |
| `  WHERE pm.org_id = v_org_id` | `` | — | — |
| `    AND pm.mode_key = 'recurring'` | `` | — | — |
| `    AND pm.is_active = true` | `` | — | — |
| `    AND (pm.vertical_id IS NULL OR pm.vertical_id = v_vertical_id)` | `` | — | — |
| `  LIMIT 1;` | `` | — | — |
| `public` | `` | — | — |
| `  SELECT mtx.amount_cents INTO v_first` | `` | — | — |
| `  FROM public.pricing_matrix mtx` | `` | — | — |
| `  WHERE mtx.org_id = v_org_id` | `` | — | — |
| `    AND mtx.vertical_id = v_vertical_id` | `` | — | — |
| `    AND mtx.service_offering_id = v_service_offering_id` | `` | — | — |
| `    AND mtx.pricing_mode_id = v_initial_mode_id` | `` | — | — |
| `    AND mtx.pricing_dimension_value_id = v_dimension_value_id` | `` | — | — |
| `    AND mtx.service_plan_template_id IS NULL` | `` | — | — |
| `    AND mtx.currency = 'USD'` | `` | — | — |
| `    AND mtx.is_active = true` | `` | — | — |
| `  LIMIT 1;` | `` | — | — |
| `public` | `` | — | — |
| `  IF v_first IS NULL THEN` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  v_recurring := NULL;` | `` | — | — |
| `  v_freq_label := NULL;` | `` | — | — |
| `  v_discount_label := NULL;` | `` | — | — |
| `  v_plan_template_id := NULL;` | `` | — | — |
| `public` | `` | — | — |
| `    FROM public.pricing_frequencies pf` | `` | — | — |
| `    WHERE pf.vertical_id = v_vertical_id` | `` | — | — |
| `      AND pf.frequency_key = p_frequency_key` | `` | — | — |
| `      AND pf.is_active = true` | `` | — | — |
| `    LIMIT 1;` | `` | — | — |
| `public` | `` | — | — |
| `    IF v_frequency_id IS NOT NULL` | `` | — | — |
| `       AND v_recurring_mode_id IS NOT NULL` | `` | — | — |
| `       AND v_plan_template_id IS NOT NULL THEN` | `` | — | — |
| `      SELECT mtx.amount_cents INTO v_recurring` | `` | — | — |
| `      FROM public.pricing_matrix mtx` | `` | — | — |
| `      WHERE mtx.org_id = v_org_id` | `` | — | — |
| `        AND mtx.vertical_id = v_vertical_id` | `` | — | — |
| `        AND mtx.service_offering_id = v_service_offering_id` | `` | — | — |
| `        AND mtx.pricing_mode_id = v_recurring_mode_id` | `` | — | — |
| `        AND mtx.pricing_dimension_value_id = v_dimension_value_id` | `` | — | — |
| `        AND mtx.service_plan_template_id = v_plan_template_id` | `` | — | — |
| `        AND mtx.currency = 'USD'` | `` | — | — |
| `        AND mtx.is_active = true` | `` | — | — |
| `      LIMIT 1;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  FROM public.pricing_addons pa` | `` | — | — |
| `  WHERE pa.vertical_id = v_vertical_id` | `` | — | — |
| `    AND pa.is_active = true` | `` | — | — |
| `public` | `` | — | — |
| `  out_vertical_slug := p_vertical_slug;` | `` | — | — |
| `  out_service_key := p_service_key;` | `` | — | — |
| `  out_sqft_key := p_sqft_key;` | `` | — | — |
| `  out_frequency_key := p_frequency_key;` | `` | — | — |
| `public` | `` | — | — |
| `  first_clean_cents := v_first;` | `` | — | — |
| `  recurring_cents := v_recurring;` | `` | — | — |
| `  addons_total_cents := v_addons;` | `` | — | — |
| `  total_first_visit_cents := v_first + v_addons;` | `` | — | — |
| `public` | `` | — | — |
| `  price_breakdown :=` | `` | — | — |
| `    'Sq Ft tier: ' || p_sqft_key ||` | `` | — | — |
| `    ' | Service: ' || p_service_key ||` | `` | — | — |
| `    CASE WHEN v_addons > 0 THEN` | `` | — | — |
| `    ELSE '' END ||` | `` | — | — |
| `    CASE WHEN v_recurring IS NOT NULL THEN` | `` | — | — |
| `      CASE WHEN v_discount_label IS NOT NULL THEN ' (' || v_discount_label || ')' ELSE '' END` | `` | — | — |
| `    ELSE '' END;` | `` | — | — |
| `public` | `` | — | — |
| `  is_manual_quote := false;` | `` | — | — |
| `  RETURN NEXT;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS boolean` | `` | — | — |
| ` LANGUAGE sql` | `` | — | — |
| ` STABLE` | `` | — | — |
| `AS $function$` | `` | — | — |
| `  SELECT EXISTS (` | `` | — | — |
| `    SELECT 1` | `` | — | — |
| `    FROM public.user_roles ur` | `` | — | — |
| `    WHERE ur.user_id = auth.uid()` | `` | — | — |
| `      AND ur.org_id = _org_id` | `` | — | — |
| `      AND ur.role = ANY(_roles)` | `` | — | — |
| `  );` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS boolean` | `` | — | — |
| ` LANGUAGE sql` | `` | — | — |
| ` STABLE` | `` | — | — |
| `AS $function$` | `` | — | — |
| `  select exists (` | `` | — | — |
| `    select 1` | `` | — | — |
| `    from public.app_users` | `` | — | — |
| `    where id = auth.uid()` | `` | — | — |
| `      and role = 'admin'` | `` | — | — |
| `  );` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS boolean` | `` | — | — |
| ` LANGUAGE sql` | `` | — | — |
| ` STABLE SECURITY DEFINER` | `` | — | — |
| `AS $function$` | `` | — | — |
| `  select exists (` | `` | — | — |
| `    select 1` | `` | — | — |
| `    from public.user_roles ur` | `` | — | — |
| `    where ur.org_id = p_org_id` | `` | — | — |
| `      and ur.user_id = auth.uid()` | `` | — | — |
| `  );` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `declare` | `` | — | — |
| `  parent_org uuid;` | `` | — | — |
| `begin` | `` | — | — |
| `  if new.parent_location_id is null then` | `` | — | — |
| `    return new;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  select org_id into parent_org` | `` | — | — |
| `  from public.locations` | `` | — | — |
| `  where id = new.parent_location_id;` | `` | — | — |
| `public` | `` | — | — |
| `  if parent_org is null then` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  if parent_org <> new.org_id then` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS bigint` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| ` SECURITY DEFINER` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `  v_entity text;` | `` | — | — |
| `  v_tbl text;` | `` | — | — |
| `  v_col text;` | `` | — | — |
| `  v_next bigint;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `  IF p_org_id IS NULL THEN` | `` | — | — |
| `    RAISE EXCEPTION 'next_org_scoped_record_number: org_id is required';` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  v_entity := lower(trim(p_entity));` | `` | — | — |
| `  IF v_entity IS NULL OR v_entity = '' THEN` | `` | — | — |
| `    RAISE EXCEPTION 'next_org_scoped_record_number: entity is required';` | `` | — | — |
| `  END IF;` | `` | — | — |
| `public` | `` | — | — |
| `  -- Serialize allocators per org + entity (transaction-scoped; released at commit/rollback).` | `` | — | — |
| `  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text || '|' || v_entity));` | `` | — | — |
| `public` | `` | — | — |
| `  CASE v_entity` | `` | — | — |
| `    WHEN 'customer' THEN` | `` | — | — |
| `      v_tbl := 'customers';` | `` | — | — |
| `      v_col := 'customer_number';` | `` | — | — |
| `    WHEN 'job' THEN` | `` | — | — |
| `      v_tbl := 'jobs';` | `` | — | — |
| `      v_col := 'job_number';` | `` | — | — |
| `    WHEN 'opportunity' THEN` | `` | — | — |
| `      v_tbl := 'opportunities';` | `` | — | — |
| `      v_col := 'opportunity_number';` | `` | — | — |
| `    WHEN 'location' THEN` | `` | — | — |
| `      v_tbl := 'locations';` | `` | — | — |
| `      v_col := 'location_number';` | `` | — | — |
| `    WHEN 'person' THEN` | `` | — | — |
| `      v_tbl := 'persons';` | `` | — | — |
| `      v_col := 'person_number';` | `` | — | — |
| `    WHEN 'vendor' THEN` | `` | — | — |
| `      v_tbl := 'vendors';` | `` | — | — |
| `      v_col := 'vendor_number';` | `` | — | — |
| `    WHEN 'schedule' THEN` | `` | — | — |
| `      v_tbl := 'schedules';` | `` | — | — |
| `      v_col := 'schedule_number';` | `` | — | — |
| `    ELSE` | `` | — | — |
| `  END CASE;` | `` | — | — |
| `public` | `` | — | — |
| `  EXECUTE format(` | `` | — | — |
| `    v_col` | `` | — | — |
| `    v_tbl` | `` | — | — |
| `  )` | `` | — | — |
| `  INTO v_next` | `` | — | — |
| `  USING p_org_id;` | `` | — | — |
| `public` | `` | — | — |
| `  RETURN v_next;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS uuid` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| ` SECURITY DEFINER` | `` | — | — |
| `AS $function$` | `` | — | — |
| `declare` | `` | — | — |
| `  v_tx public.ledger_transactions%rowtype;` | `` | — | — |
| `  v_entry_id uuid;` | `` | — | — |
| `  v_cash_acct uuid;` | `` | — | — |
| `  v_clearing_acct uuid;` | `` | — | — |
| `  v_ar_acct uuid;` | `` | — | — |
| `  v_rev_acct uuid;` | `` | — | — |
| `  v_contractor_payable_acct uuid;` | `` | — | — |
| `  v_contractor_cogs_acct uuid;` | `` | — | — |
| `  v_fees_acct uuid;` | `` | — | — |
| `begin` | `` | — | — |
| `  select * into v_tx` | `` | — | — |
| `  from public.ledger_transactions` | `` | — | — |
| `  where id = p_ledger_tx_id;` | `` | — | — |
| `public` | `` | — | — |
| `  if not found then` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  if v_tx.journal_entry_id is not null then` | `` | — | — |
| `    return v_tx.journal_entry_id;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  -- required mappings` | `` | — | — |
| `  select gl_account_id into v_cash_acct` | `` | — | — |
| `  from public.gl_account_mappings` | `` | — | — |
| `  where org_id = v_tx.org_id and key = 'cash' and is_active = true;` | `` | — | — |
| `public` | `` | — | — |
| `  select gl_account_id into v_clearing_acct` | `` | — | — |
| `  from public.gl_account_mappings` | `` | — | — |
| `  where org_id = v_tx.org_id and key = 'stripe_clearing' and is_active = true;` | `` | — | — |
| `public` | `` | — | — |
| `  select gl_account_id into v_ar_acct` | `` | — | — |
| `  from public.gl_account_mappings` | `` | — | — |
| `  where org_id = v_tx.org_id and key = 'accounts_receivable' and is_active = true;` | `` | — | — |
| `public` | `` | — | — |
| `  select gl_account_id into v_rev_acct` | `` | — | — |
| `  from public.gl_account_mappings` | `` | — | — |
| `  where org_id = v_tx.org_id and key = 'revenue_gross' and is_active = true;` | `` | — | — |
| `public` | `` | — | — |
| `  select gl_account_id into v_contractor_payable_acct` | `` | — | — |
| `  from public.gl_account_mappings` | `` | — | — |
| `  where org_id = v_tx.org_id and key = 'contractor_payable' and is_active = true;` | `` | — | — |
| `public` | `` | — | — |
| `  select gl_account_id into v_contractor_cogs_acct` | `` | — | — |
| `  from public.gl_account_mappings` | `` | — | — |
| `  where org_id = v_tx.org_id and key = 'contractor_cogs' and is_active = true;` | `` | — | — |
| `public` | `` | — | — |
| `  select gl_account_id into v_fees_acct` | `` | — | — |
| `  from public.gl_account_mappings` | `` | — | — |
| `  where org_id = v_tx.org_id and key = 'processing_fees' and is_active = true;` | `` | — | — |
| `public` | `` | — | — |
| `  if v_cash_acct is null or v_clearing_acct is null or v_ar_acct is null or v_rev_acct is null then` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  -- create journal entry (source = ledger tx)` | `` | — | — |
| `  insert into public.gl_journal_entries (` | `` | — | — |
| `  ) values (` | `` | — | — |
| `    v_tx.org_id` | `` | — | — |
| `    (v_tx.occurred_at at time zone 'utc')::date` | `` | — | — |
| `    'posted'` | `` | — | — |
| `    now()` | `` | — | — |
| `    'ledger_transaction'` | `` | — | — |
| `    v_tx.id` | `` | — | — |
| `  )` | `` | — | — |
| `  returning id into v_entry_id;` | `` | — | — |
| `public` | `` | — | — |
| `  -- Posting rules (GROSS DEFAULT)` | `` | — | — |
| `  if v_tx.type = 'customer_charge' then` | `` | — | — |
| `    insert into public.gl_journal_lines` | `` | — | — |
| `    values` | `` | — | — |
| `public` | `` | — | — |
| `  elsif v_tx.type = 'contractor_payout' then` | `` | — | — |
| `    if v_contractor_payable_acct is null or v_contractor_cogs_acct is null then` | `` | — | — |
| `    end if;` | `` | — | — |
| `public` | `` | — | — |
| `    insert into public.gl_journal_lines` | `` | — | — |
| `    values` | `` | — | — |
| `public` | `` | — | — |
| `  elsif v_tx.type = 'processing_fee' then` | `` | — | — |
| `    if v_fees_acct is null then` | `` | — | — |
| `    end if;` | `` | — | — |
| `public` | `` | — | — |
| `    insert into public.gl_journal_lines` | `` | — | — |
| `    values` | `` | — | — |
| `public` | `` | — | — |
| `  else` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  -- link ledger tx -> journal entry` | `` | — | — |
| `  update public.ledger_transactions` | `` | — | — |
| `  set journal_entry_id = v_entry_id` | `` | — | — |
| `  where id = v_tx.id;` | `` | — | — |
| `public` | `` | — | — |
| `  return v_entry_id;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS void` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| ` SECURITY DEFINER` | `` | — | — |
| ` SET search_path TO 'public'` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  -- Minimal safe behavior: mark as posted so the trigger chain completes.` | `` | — | — |
| `  update public.payments` | `` | — | — |
| `  set posted_to_ledger_at = now()` | `` | — | — |
| `  where id = payment_id` | `` | — | — |
| `    and posted_to_ledger_at is null;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `BEGIN` | `` | — | — |
| `        USING ERRCODE = '0A000';` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  -- Only enforce for updates` | `` | — | — |
| `  if (tg_op <> 'UPDATE') then` | `` | — | — |
| `    return new;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  if (old.status_key = 'completed') then` | `` | — | — |
| `public` | `` | — | — |
| `    -- Block changing assigned_vendor_id` | `` | — | — |
| `    if (new.assigned_vendor_id is distinct from old.assigned_vendor_id) then` | `` | — | — |
| `      raise exception 'Cannot change assigned vendor for a completed schedule.';` | `` | — | — |
| `    end if;` | `` | — | — |
| `public` | `` | — | — |
| `    -- Block changing job_id` | `` | — | — |
| `    if (new.job_id is distinct from old.job_id) then` | `` | — | — |
| `      raise exception 'Cannot change job for a completed schedule.';` | `` | — | — |
| `    end if;` | `` | — | — |
| `public` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS integer` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  return (round(p_cents / 500.0) * 500)::int;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS integer` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `declare` | `` | — | — |
| `  scaled numeric;` | `` | — | — |
| `  cents int;` | `` | — | — |
| `begin` | `` | — | — |
| `  scaled := old_dollars * (200.0 / 180.0);` | `` | — | — |
| `  cents := (scaled * 100)::int;` | `` | — | — |
| `  return public.round_to_nearest_5_cents(cents);` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS void` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| ` SECURITY DEFINER` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  -- Permission catalog (add as we expand; start with what we enforce now)` | `` | — | — |
| `  values` | `` | — | — |
| `public` | `` | — | — |
| `public` | `` | — | — |
| `public` | `` | — | — |
| `  on conflict (key) do nothing;` | `` | — | — |
| `public` | `` | — | — |
| `  -- Default roles for the org (matches your existing admin/ops reality)` | `` | — | — |
| `  values` | `` | — | — |
| `public` | `` | — | — |
| `  -- Grants for admin: everything` | `` | — | — |
| `  from public.permission_keys pk` | `` | — | — |
| `  where pk.is_active = true` | `` | — | — |
| `public` | `` | — | — |
| `  -- Grants for ops: no system user/role write` | `` | — | — |
| `  from public.permission_keys pk` | `` | — | — |
| `  where pk.is_active = true` | `` | — | — |
| `public` | `` | — | — |
| `end$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  new.updated_at = now();` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    new_wo jsonb;` | `` | — | — |
| `    old_wo jsonb;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    new_wo := to_jsonb(NEW) - 'metadata' - 'updated_at';` | `` | — | — |
| `    old_wo := to_jsonb(OLD) - 'metadata' - 'updated_at';` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.metadata IS DISTINCT FROM OLD.metadata AND new_wo IS NOT DISTINCT FROM old_wo THEN` | `` | — | — |
| `        NEW.updated_at := OLD.updated_at;` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    NEW.updated_at := now();` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF NEW.version_number IS NOT NULL AND (NEW.version IS NULL OR NEW.version <> NEW.version_number) THEN` | `` | — | — |
| `        NEW.version := NEW.version_number;` | `` | — | — |
| `    ELSIF NEW.version IS NOT NULL AND NEW.version_number IS NULL THEN` | `` | — | — |
| `        NEW.version_number := NEW.version;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    p_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fd.org_id INTO p_org` | `` | — | — |
| `    FROM public.form_definitions fd` | `` | — | — |
| `    WHERE fd.id = NEW.form_definition_id;` | `` | — | — |
| `    IF p_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.org_id IS NOT NULL AND NEW.org_id <> p_org THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_definition_versions: org_id must match form_definitions.org_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    NEW.org_id := p_org;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    p_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fpd.org_id INTO p_org` | `` | — | — |
| `    FROM public.form_packet_definitions fpd` | `` | — | — |
| `    WHERE fpd.id = NEW.packet_definition_id;` | `` | — | — |
| `    IF p_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.org_id IS NOT NULL AND NEW.org_id <> p_org THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_items: org_id must match form_packet_definitions.org_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    NEW.org_id := p_org;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    o uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fps.org_id INTO o FROM public.form_packet_sessions fps WHERE fps.id = NEW.packet_session_id;` | `` | — | — |
| `    IF o IS NULL THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_session_items: packet_session_id not found';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    NEW.org_id := o;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    p_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fpd.org_id INTO p_org` | `` | — | — |
| `    FROM public.form_packet_definitions fpd` | `` | — | — |
| `    WHERE fpd.id = NEW.packet_definition_id;` | `` | — | — |
| `    IF p_org IS NULL THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_sessions: packet_definition_id not found';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.org_id IS NOT NULL AND NEW.org_id <> p_org THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_sessions: org_id must match packet definition org';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    NEW.org_id := p_org;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    p_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF TG_OP = 'UPDATE' AND NEW.form_definition_id IS NOT DISTINCT FROM OLD.form_definition_id THEN` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    SELECT fd.org_id INTO p_org FROM public.form_definitions fd WHERE fd.id = NEW.form_definition_id;` | `` | — | — |
| `    IF p_org IS NULL THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_public_links: form_definition_id invalid';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    NEW.org_id := p_org;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    o uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fs.org_id INTO o FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;` | `` | — | — |
| `    IF o IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    NEW.org_id := o;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    o uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fs.org_id INTO o FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;` | `` | — | — |
| `    IF o IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    NEW.org_id := o;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    vid uuid := NEW.form_definition_version_id;` | `` | — | — |
| `    v_def uuid;` | `` | — | — |
| `    v_org uuid;` | `` | — | — |
| `    link_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.form_definition_versions v` | `` | — | — |
| `    WHERE v.id = vid;` | `` | — | — |
| `    IF v_def IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.form_definition_id IS NOT NULL AND NEW.form_definition_id <> v_def THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_submissions: form_definition_id must match version.form_definition_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    NEW.form_definition_id := v_def;` | `` | — | — |
| `    NEW.org_id := v_org;` | `` | — | — |
| `public` | `` | — | — |
| `    -- Run after org_id is authoritative (ordering-safe vs separate triggers)` | `` | — | — |
| `    IF NEW.created_via_public_link_id IS NOT NULL THEN` | `` | — | — |
| `        SELECT fpl.org_id INTO link_org FROM public.form_public_links fpl WHERE fpl.id = NEW.created_via_public_link_id;` | `` | — | — |
| `        IF link_org IS NULL THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_submissions: created_via_public_link_id not found';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF link_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_submissions: public link org_id must match submission org_id';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| ` SECURITY DEFINER` | `` | — | — |
| `AS $function$` | `` | — | — |
| `BEGIN` | `` | — | — |
| `  CASE TG_TABLE_NAME::text` | `` | — | — |
| `    WHEN 'persons' THEN` | `` | — | — |
| `      IF NEW.person_number IS NULL THEN` | `` | — | — |
| `        IF NEW.org_id IS NULL THEN` | `` | — | — |
| `          RAISE EXCEPTION 'persons: org_id is required when person_number is omitted';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `      END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    WHEN 'customers' THEN` | `` | — | — |
| `      IF NEW.customer_number IS NULL THEN` | `` | — | — |
| `        IF NEW.org_id IS NULL THEN` | `` | — | — |
| `          RAISE EXCEPTION 'customers: org_id is required when customer_number is omitted';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `      END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    WHEN 'jobs' THEN` | `` | — | — |
| `      IF NEW.job_number IS NULL THEN` | `` | — | — |
| `        IF NEW.org_id IS NULL THEN` | `` | — | — |
| `          RAISE EXCEPTION 'jobs: org_id is required when job_number is omitted';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `      END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    WHEN 'opportunities' THEN` | `` | — | — |
| `      IF NEW.opportunity_number IS NULL THEN` | `` | — | — |
| `        IF NEW.org_id IS NULL THEN` | `` | — | — |
| `          RAISE EXCEPTION 'opportunities: org_id is required when opportunity_number is omitted';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `      END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    WHEN 'locations' THEN` | `` | — | — |
| `      IF NEW.location_number IS NULL THEN` | `` | — | — |
| `        IF NEW.org_id IS NULL THEN` | `` | — | — |
| `          RAISE EXCEPTION 'locations: org_id is required when location_number is omitted';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `      END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    WHEN 'vendors' THEN` | `` | — | — |
| `      IF NEW.vendor_number IS NULL THEN` | `` | — | — |
| `        IF NEW.org_id IS NULL THEN` | `` | — | — |
| `          RAISE EXCEPTION 'vendors: org_id is required when vendor_number is omitted';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `      END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    WHEN 'schedules' THEN` | `` | — | — |
| `      IF NEW.schedule_number IS NULL THEN` | `` | — | — |
| `        IF NEW.org_id IS NULL THEN` | `` | — | — |
| `          RAISE EXCEPTION 'schedules: org_id is required when schedule_number is omitted';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `      END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    ELSE` | `` | — | — |
| `  END CASE;` | `` | — | — |
| `public` | `` | — | — |
| `  RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `declare` | `` | — | — |
| `  v_completed_count integer;` | `` | — | — |
| `  v_job_number integer;` | `` | — | — |
| `  v_contractor_bps integer;` | `` | — | — |
| `  v_alloy_bps integer;` | `` | — | — |
| `  v_gross integer;` | `` | — | — |
| `begin` | `` | — | — |
| `  -- Require customer_id + vertical_id to compute tier` | `` | — | — |
| `  if new.customer_id is null or new.vertical_id is null then` | `` | — | — |
| `    return new;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  -- Ensure a counter row exists` | `` | — | — |
| `public` | `` | — | — |
| `  select completed_count` | `` | — | — |
| `    into v_completed_count` | `` | — | — |
| `  from public.customer_vertical_job_counters` | `` | — | — |
| `  where customer_id = new.customer_id` | `` | — | — |
| `    and vertical_id = new.vertical_id;` | `` | — | — |
| `public` | `` | — | — |
| `  -- Job number is next based on completed count` | `` | — | — |
| `public` | `` | — | — |
| `  -- Only set job_number if not provided explicitly` | `` | — | — |
| `  if new.job_number_for_customer is null then` | `` | — | — |
| `    new.job_number_for_customer := v_job_number;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  -- Compute split from job_number` | `` | — | — |
| `  from public.fn_job_split_bps(new.job_number_for_customer);` | `` | — | — |
| `public` | `` | — | — |
| `  new.contractor_split_bps := v_contractor_bps;` | `` | — | — |
| `  new.alloy_split_bps := v_alloy_bps;` | `` | — | — |
| `public` | `` | — | — |
| `  -- Determine gross price for payout math:` | `` | — | — |
| `public` | `` | — | — |
| `  if v_gross is not null then` | `` | — | — |
| `    new.gross_price_cents := v_gross;` | `` | — | — |
| `public` | `` | — | — |
| `    -- Integer math (round down cents)` | `` | — | — |
| `    new.contractor_payout_cents := (v_gross * v_contractor_bps) / 10000;` | `` | — | — |
| `    new.alloy_fee_cents := v_gross - new.contractor_payout_cents;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  -- Only when completed_at transitions from null -> not null` | `` | — | — |
| `  if (old.completed_at is null) and (new.completed_at is not null) then` | `` | — | — |
| `    if new.customer_id is not null and new.vertical_id is not null then` | `` | — | — |
| `      do update set` | `` | — | — |
| `        completed_count = public.customer_vertical_job_counters.completed_count + 1` | `` | — | — |
| `        updated_at = now();` | `` | — | — |
| `    end if;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  if new.posted_to_ledger_at is not null then` | `` | — | — |
| `    return new;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  if (new.posted_at is not null)` | `` | — | — |
| `     and (old.posted_at is distinct from new.posted_at)` | `` | — | — |
| `  then` | `` | — | — |
| `    perform public.post_payment_to_ledger(new.id);` | `` | — | — |
| `    return new;` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  if (new.paid_at is not null)` | `` | — | — |
| `     and (old.paid_at is distinct from new.paid_at)` | `` | — | — |
| `  then` | `` | — | — |
| `    perform public.post_payment_to_ledger(new.id);` | `` | — | — |
| `  end if;` | `` | — | — |
| `public` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS boolean` | `` | — | — |
| ` LANGUAGE sql` | `` | — | — |
| ` STABLE SECURITY DEFINER` | `` | — | — |
| ` SET search_path TO 'public'` | `` | — | — |
| `AS $function$` | `` | — | — |
| `  select exists (` | `` | — | — |
| `    select 1` | `` | — | — |
| `    from public.app_users au` | `` | — | — |
| `    where au.id = auth.uid()` | `` | — | — |
| `      and au.org_id = target_org_id` | `` | — | — |
| `  );` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    agr_org uuid;` | `` | — | — |
| `    agr_member uuid;` | `` | — | — |
| `    agr_site uuid;` | `` | — | — |
| `    site_org uuid;` | `` | — | — |
| `    site_type text;` | `` | — | — |
| `    r_org uuid;` | `` | — | — |
| `    r_type text;` | `` | — | — |
| `    r_parent uuid;` | `` | — | — |
| `    c_org uuid;` | `` | — | — |
| `    c_agreement uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.child_enrollment_agreements a` | `` | — | — |
| `    WHERE a.id = NEW.enrollment_agreement_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF agr_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF agr_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_attendance_events: agreement org mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF agr_member <> NEW.customer_member_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_attendance_events: customer_member_id does not match agreement' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.site_location_id <> agr_site THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_attendance_events: site_location_id must match agreement site' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    FROM public.locations l WHERE l.id = NEW.site_location_id;` | `` | — | — |
| `    IF site_org IS NULL OR site_org <> NEW.org_id OR site_type IS DISTINCT FROM 'site' THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    -- Any referenced room must be a unit under the agreement site.` | `` | — | — |
| `    IF NEW.room_location_id IS NOT NULL OR NEW.from_room_location_id IS NOT NULL OR NEW.to_room_location_id IS NOT NULL THEN` | `` | — | — |
| `            FROM public.locations l` | `` | — | — |
| `        LOOP` | `` | — | — |
| `            IF r_org IS DISTINCT FROM NEW.org_id OR r_type IS DISTINCT FROM 'unit' THEN` | `` | — | — |
| `                RAISE EXCEPTION 'child_attendance_events: room must be a unit in the same org' USING ERRCODE = '23514';` | `` | — | — |
| `            END IF;` | `` | — | — |
| `            IF r_parent IS DISTINCT FROM NEW.site_location_id THEN` | `` | — | — |
| `                RAISE EXCEPTION 'child_attendance_events: room must be a child of the agreement site' USING ERRCODE = '23514';` | `` | — | — |
| `            END IF;` | `` | — | — |
| `        END LOOP;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    -- Correction/reversal target must be a prior event in the same org + agreement.` | `` | — | — |
| `    IF NEW.corrects_event_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.child_attendance_events e WHERE e.id = NEW.corrects_event_id;` | `` | — | — |
| `        IF c_org IS NULL THEN` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF c_org <> NEW.org_id OR c_agreement <> NEW.enrollment_agreement_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'child_attendance_events: correction must target an event on the same org and agreement' USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `    opp_customer uuid;` | `` | — | — |
| `    ocm_org uuid;` | `` | — | — |
| `    ocm_opp uuid;` | `` | — | — |
| `    ocm_member uuid;` | `` | — | — |
| `    mem_org uuid;` | `` | — | — |
| `    mem_customer uuid;` | `` | — | — |
| `    mem_person uuid;` | `` | — | — |
| `    person_org uuid;` | `` | — | — |
| `    site_org uuid;` | `` | — | — |
| `    site_type text;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.customer_members cm` | `` | — | — |
| `    WHERE cm.id = NEW.customer_member_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF mem_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF mem_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_enrollment_agreements: customer_member org mismatch'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.customer_id IS NULL THEN` | `` | — | — |
| `        NEW.customer_id := mem_customer;` | `` | — | — |
| `    ELSIF NEW.customer_id <> mem_customer THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_enrollment_agreements: customer_id does not match customer_member'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.person_id IS NULL THEN` | `` | — | — |
| `        NEW.person_id := mem_person;` | `` | — | — |
| `    ELSIF NEW.person_id IS DISTINCT FROM mem_person THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_enrollment_agreements: person_id does not match customer_member'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.opportunity_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.opportunities o` | `` | — | — |
| `        WHERE o.id = NEW.opportunity_id;` | `` | — | — |
| `public` | `` | — | — |
| `        IF opp_org IS NULL THEN` | `` | — | — |
| `                USING ERRCODE = '23503';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF opp_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'child_enrollment_agreements: opportunity org mismatch'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF NEW.customer_id IS NOT NULL AND opp_customer IS NOT NULL AND NEW.customer_id <> opp_customer THEN` | `` | — | — |
| `            RAISE EXCEPTION 'child_enrollment_agreements: opportunity customer mismatch'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.opportunity_customer_member_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.opportunity_customer_members ocm` | `` | — | — |
| `        WHERE ocm.id = NEW.opportunity_customer_member_id;` | `` | — | — |
| `public` | `` | — | — |
| `        IF ocm_org IS NULL THEN` | `` | — | — |
| `            RAISE EXCEPTION 'child_enrollment_agreements: opportunity_customer_member_id % not found'` | `` | — | — |
| `                NEW.opportunity_customer_member_id` | `` | — | — |
| `                USING ERRCODE = '23503';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF ocm_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'child_enrollment_agreements: OCM org mismatch'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF NEW.opportunity_id IS NOT NULL AND ocm_opp <> NEW.opportunity_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'child_enrollment_agreements: OCM opportunity mismatch'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF ocm_member <> NEW.customer_member_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'child_enrollment_agreements: OCM customer_member mismatch'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    FROM public.locations l` | `` | — | — |
| `    WHERE l.id = NEW.site_location_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF site_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF site_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_enrollment_agreements: site org mismatch'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF site_type IS DISTINCT FROM 'site' THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_enrollment_agreements: site_location_id % must be location_type site (got %)'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    agr_org uuid;` | `` | — | — |
| `    agr_member uuid;` | `` | — | — |
| `    agr_site uuid;` | `` | — | — |
| `    site_org uuid;` | `` | — | — |
| `    site_type text;` | `` | — | — |
| `    room_org uuid;` | `` | — | — |
| `    room_type text;` | `` | — | — |
| `    room_parent uuid;` | `` | — | — |
| `    prog_org uuid;` | `` | — | — |
| `    prog_site uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.child_enrollment_agreements a` | `` | — | — |
| `    WHERE a.id = NEW.enrollment_agreement_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF agr_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF agr_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_placements: agreement org mismatch'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF agr_member <> NEW.customer_member_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_placements: customer_member_id does not match agreement'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.site_location_id <> agr_site THEN` | `` | — | — |
| `        RAISE EXCEPTION 'child_placements: site_location_id must match agreement site'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    FROM public.locations l` | `` | — | — |
| `    WHERE l.id = NEW.site_location_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF site_org IS NULL OR site_org <> NEW.org_id OR site_type IS DISTINCT FROM 'site' THEN` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.program_category_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.location_program_categories lpc` | `` | — | — |
| `        WHERE lpc.id = NEW.program_category_id;` | `` | — | — |
| `public` | `` | — | — |
| `        IF prog_org IS NULL THEN` | `` | — | — |
| `                USING ERRCODE = '23503';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF prog_org <> NEW.org_id OR prog_site <> NEW.site_location_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'child_placements: program_category must belong to placement site'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.room_location_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.locations l` | `` | — | — |
| `        WHERE l.id = NEW.room_location_id;` | `` | — | — |
| `public` | `` | — | — |
| `        IF room_org IS NULL THEN` | `` | — | — |
| `                USING ERRCODE = '23503';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF room_org <> NEW.org_id OR room_type IS DISTINCT FROM 'unit' THEN` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF room_parent IS DISTINCT FROM NEW.site_location_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'child_placements: room % must be child of site %'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    site_org uuid;` | `` | — | — |
| `    site_type text;` | `` | — | — |
| `    prog_org uuid;` | `` | — | — |
| `    room_org uuid;` | `` | — | — |
| `    room_type text;` | `` | — | — |
| `    room_parent uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF NEW.site_location_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.locations l WHERE l.id = NEW.site_location_id;` | `` | — | — |
| `        IF site_org IS NULL THEN` | `` | — | — |
| `                USING ERRCODE = '23503';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF site_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'childcare config scope: site org mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF site_type IS DISTINCT FROM 'site' THEN` | `` | — | — |
| `            RAISE EXCEPTION 'childcare config scope: site_location_id % must be location_type site (got %)'` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.program_category_id IS NOT NULL THEN` | `` | — | — |
| `        SELECT lpc.org_id INTO prog_org` | `` | — | — |
| `        FROM public.location_program_categories lpc WHERE lpc.id = NEW.program_category_id;` | `` | — | — |
| `        IF prog_org IS NULL THEN` | `` | — | — |
| `                USING ERRCODE = '23503';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF prog_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'childcare config scope: program category org mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.room_location_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.locations l WHERE l.id = NEW.room_location_id;` | `` | — | — |
| `        IF room_org IS NULL THEN` | `` | — | — |
| `                USING ERRCODE = '23503';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF room_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'childcare config scope: room org mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF room_type IS DISTINCT FROM 'unit' THEN` | `` | — | — |
| `            RAISE EXCEPTION 'childcare config scope: room_location_id % must be location_type unit (got %)'` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    def_org uuid;` | `` | — | — |
| `    ver_form uuid;` | `` | — | — |
| `    ver_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fd.org_id INTO def_org FROM public.form_definitions fd WHERE fd.id = NEW.form_definition_id;` | `` | — | — |
| `    IF def_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF def_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_items: form_definition must belong to same org as packet';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.pinned_form_definition_version_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.form_definition_versions v` | `` | — | — |
| `        WHERE v.id = NEW.pinned_form_definition_version_id;` | `` | — | — |
| `        IF ver_form IS NULL THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_packet_items: pinned_form_definition_version_id not found';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF ver_form <> NEW.form_definition_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_packet_items: pinned version must match form_definition_id';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF ver_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_packet_items: pinned version org mismatch';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    sess_def uuid;` | `` | — | — |
| `    item_def uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fps.packet_definition_id INTO sess_def FROM public.form_packet_sessions fps WHERE fps.id = NEW.packet_session_id;` | `` | — | — |
| `    SELECT fpi.packet_definition_id INTO item_def FROM public.form_packet_items fpi WHERE fpi.id = NEW.packet_item_id;` | `` | — | — |
| `    IF sess_def IS DISTINCT FROM item_def THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_session_items: packet_item does not belong to session packet_definition';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    sub_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF NEW.form_submission_id IS NULL THEN` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    SELECT fs.org_id INTO sub_org FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;` | `` | — | — |
| `    IF sub_org IS NULL THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_session_items: form_submission_id not found';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF sub_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_session_items: submission org_id mismatch';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    link_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fpl.org_id INTO link_org FROM public.form_public_links fpl WHERE fpl.id = NEW.started_via_public_link_id;` | `` | — | — |
| `    IF link_org IS NULL THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_sessions: started_via_public_link_id not found';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF link_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_packet_sessions: link org_id must match session org_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    def_org uuid;` | `` | — | — |
| `    ver_form uuid;` | `` | — | — |
| `    ver_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fd.org_id INTO def_org` | `` | — | — |
| `    FROM public.form_definitions fd` | `` | — | — |
| `    WHERE fd.id = NEW.form_definition_id;` | `` | — | — |
| `    IF def_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF def_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_public_links: org_id must match form_definitions.org_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.pinned_form_definition_version_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.form_definition_versions v` | `` | — | — |
| `        WHERE v.id = NEW.pinned_form_definition_version_id;` | `` | — | — |
| `public` | `` | — | — |
| `        IF ver_form IS NULL THEN` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF ver_form <> NEW.form_definition_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_public_links: pinned version must belong to same form_definition_id';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF ver_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'form_public_links: pinned version org_id mismatch';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    row_org uuid;` | `` | — | — |
| `    doc_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT fs.org_id INTO row_org FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;` | `` | — | — |
| `    SELECT d.org_id INTO doc_org FROM public.documents d WHERE d.id = NEW.document_id;` | `` | — | — |
| `    IF doc_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF doc_org <> row_org THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_submission_documents: document.org_id must match submission.org_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.org_id <> row_org THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_submission_documents: org_id must match submission';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    row_org uuid;` | `` | — | — |
| `    doc_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF NEW.drawn_asset_document_id IS NULL THEN` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    SELECT fs.org_id INTO row_org FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;` | `` | — | — |
| `    SELECT d.org_id INTO doc_org FROM public.documents d WHERE d.id = NEW.drawn_asset_document_id;` | `` | — | — |
| `    IF doc_org IS NULL THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_submission_signatures: drawn_asset_document_id not found';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF doc_org <> row_org THEN` | `` | — | — |
| `        RAISE EXCEPTION 'form_submission_signatures: drawn asset document.org_id must match submission.org_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `    opp_customer uuid;` | `` | — | — |
| `    mem_org uuid;` | `` | — | — |
| `    mem_customer uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.opportunities o` | `` | — | — |
| `    WHERE o.id = NEW.opportunity_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF opp_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF opp_org <> NEW.org_id THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    FROM public.customer_members cm` | `` | — | — |
| `    WHERE cm.id = NEW.customer_member_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF mem_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF mem_org <> NEW.org_id THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF opp_customer IS NOT NULL AND mem_customer IS NOT NULL AND mem_customer <> opp_customer THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `    person_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.opportunity_id;` | `` | — | — |
| `    IF opp_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.org_id IS DISTINCT FROM opp_org THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    SELECT p.org_id INTO person_org FROM public.persons p WHERE p.id = NEW.person_id;` | `` | — | — |
| `    IF person_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.org_id IS DISTINCT FROM person_org THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `    opp_customer uuid;` | `` | — | — |
| `    ocm_org uuid;` | `` | — | — |
| `    ocm_opp uuid;` | `` | — | — |
| `    ocm_member uuid;` | `` | — | — |
| `    mem_org uuid;` | `` | — | — |
| `    mem_customer uuid;` | `` | — | — |
| `    person_org uuid;` | `` | — | — |
| `    site_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.opportunities o` | `` | — | — |
| `    WHERE o.id = NEW.opportunity_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF opp_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF opp_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'placement_candidates: org_id mismatch with opportunity'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.customer_id IS NOT NULL AND opp_customer IS NOT NULL AND NEW.customer_id <> opp_customer THEN` | `` | — | — |
| `        RAISE EXCEPTION 'placement_candidates: customer_id does not match opportunity.customer_id'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.opportunity_customer_member_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.opportunity_customer_members ocm` | `` | — | — |
| `        WHERE ocm.id = NEW.opportunity_customer_member_id;` | `` | — | — |
| `public` | `` | — | — |
| `        IF ocm_org IS NULL THEN` | `` | — | — |
| `                USING ERRCODE = '23503';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF ocm_org <> NEW.org_id OR ocm_opp <> NEW.opportunity_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: OCM org/opportunity mismatch'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `public` | `` | — | — |
| `        IF NEW.customer_member_id IS NULL THEN` | `` | — | — |
| `            NEW.customer_member_id := ocm_member;` | `` | — | — |
| `        ELSIF NEW.customer_member_id <> ocm_member THEN` | `` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: customer_member_id does not match OCM row'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.customer_member_id IS NOT NULL THEN` | `` | — | — |
| `        FROM public.customer_members cm` | `` | — | — |
| `        WHERE cm.id = NEW.customer_member_id;` | `` | — | — |
| `public` | `` | — | — |
| `        IF mem_org IS NULL THEN` | `` | — | — |
| `                USING ERRCODE = '23503';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF mem_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: customer_member org mismatch'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF opp_customer IS NOT NULL AND mem_customer IS NOT NULL AND mem_customer <> opp_customer THEN` | `` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: customer_member customer mismatch with opportunity'` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `public` | `` | — | — |
| `        IF NEW.person_id IS NULL THEN` | `` | — | — |
| `            SELECT cm.person_id INTO NEW.person_id` | `` | — | — |
| `            FROM public.customer_members cm` | `` | — | — |
| `            WHERE cm.id = NEW.customer_member_id;` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.person_id IS NOT NULL THEN` | `` | — | — |
| `        SELECT p.org_id INTO person_org FROM public.persons p WHERE p.id = NEW.person_id;` | `` | — | — |
| `        IF person_org IS NULL THEN` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF person_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: person org mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.site_id IS NOT NULL THEN` | `` | — | — |
| `        SELECT l.org_id INTO site_org FROM public.locations l WHERE l.id = NEW.site_id;` | `` | — | — |
| `        IF site_org IS NULL THEN` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF site_org <> NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: site org mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    grp_org uuid;` | `` | — | — |
| `    grp_opp uuid;` | `` | — | — |
| `    cand_org uuid;` | `` | — | — |
| `    cand_opp uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.placement_link_groups g WHERE g.id = NEW.placement_link_group_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF grp_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    FROM public.placement_candidates c WHERE c.id = NEW.placement_candidate_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF cand_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.org_id <> grp_org OR NEW.org_id <> cand_org THEN` | `` | — | — |
| `        RAISE EXCEPTION 'placement_link_group_members: org_id mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF grp_opp <> cand_opp THEN` | `` | — | — |
| `        RAISE EXCEPTION 'placement_link_group_members: group and candidate opportunity mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `    opp_customer uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.opportunities o WHERE o.id = NEW.opportunity_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF opp_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF opp_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'placement_link_groups: org_id mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.customer_id IS NOT NULL AND opp_customer IS NOT NULL AND NEW.customer_id <> opp_customer THEN` | `` | — | — |
| `        RAISE EXCEPTION 'placement_link_groups: customer_id mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    cand_org uuid;` | `` | — | — |
| `    cand_cohort text;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.placement_candidates c` | `` | — | — |
| `    WHERE c.id = NEW.placement_candidate_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF cand_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF cand_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'placement_overrides: org_id mismatch' USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF btrim(NEW.program_room_cohort_key) <> btrim(cand_cohort) THEN` | `` | — | — |
| `        RAISE EXCEPTION 'placement_overrides: program_room_cohort_key must match candidate cohort'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    agr_org uuid;` | `` | — | — |
| `    agr_member uuid;` | `` | — | — |
| `    agr_site uuid;` | `` | — | — |
| `    pat_org uuid;` | `` | — | — |
| `    pat_site uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.child_enrollment_agreements a` | `` | — | — |
| `    WHERE a.id = NEW.enrollment_agreement_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF agr_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF agr_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'schedule_assignments: agreement org mismatch'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF agr_member <> NEW.customer_member_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'schedule_assignments: customer_member_id does not match agreement'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    FROM public.schedule_patterns sp` | `` | — | — |
| `    WHERE sp.id = NEW.schedule_pattern_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF pat_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF pat_org <> NEW.org_id OR pat_site <> agr_site THEN` | `` | — | — |
| `        RAISE EXCEPTION 'schedule_assignments: schedule_pattern must belong to agreement site'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    site_org uuid;` | `` | — | — |
| `    site_type text;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.locations l` | `` | — | — |
| `    WHERE l.id = NEW.site_location_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF site_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF site_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'schedule_patterns: site org mismatch'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF site_type IS DISTINCT FROM 'site' THEN` | `` | — | — |
| `        RAISE EXCEPTION 'schedule_patterns: site_location_id % must be location_type site (got %)'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    d smallint;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF NEW.weekdays IS NULL OR cardinality(NEW.weekdays) = 0 THEN` | `` | — | — |
| `        RAISE EXCEPTION 'schedule_patterns.weekdays must be non-empty'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    FOREACH d IN ARRAY NEW.weekdays` | `` | — | — |
| `    LOOP` | `` | — | — |
| `        IF d < 0 OR d > 6 THEN` | `` | — | — |
| `                USING ERRCODE = '23514';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END LOOP;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    loc_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    IF NEW.location_id IS NULL THEN` | `` | — | — |
| `        RETURN NEW;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    SELECT l.org_id INTO loc_org FROM public.locations l WHERE l.id = NEW.location_id;` | `` | — | — |
| `    IF loc_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF loc_org IS DISTINCT FROM NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'tour_availability_rules: location_id must belong to org_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `    loc_org uuid;` | `` | — | — |
| `    fs_org uuid;` | `` | — | — |
| `    fpl_org uuid;` | `` | — | — |
| `    parent_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.opportunity_id;` | `` | — | — |
| `    IF opp_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF NEW.org_id IS DISTINCT FROM opp_org THEN` | `` | — | — |
| `        RAISE EXCEPTION 'tour_bookings: org_id must match opportunities.org_id for opportunity_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    SELECT l.org_id INTO loc_org FROM public.locations l WHERE l.id = NEW.location_id;` | `` | — | — |
| `    IF loc_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF loc_org IS DISTINCT FROM NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'tour_bookings: location_id must belong to the same org_id';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.form_submission_id IS NOT NULL THEN` | `` | — | — |
| `        SELECT fs.org_id INTO fs_org FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;` | `` | — | — |
| `        IF fs_org IS NULL THEN` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF fs_org IS DISTINCT FROM NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'tour_bookings: form_submission_id org_id mismatch';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.form_public_link_id IS NOT NULL THEN` | `` | — | — |
| `        SELECT fpl.org_id INTO fpl_org FROM public.form_public_links fpl WHERE fpl.id = NEW.form_public_link_id;` | `` | — | — |
| `        IF fpl_org IS NULL THEN` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF fpl_org IS DISTINCT FROM NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'tour_bookings: form_public_link_id org_id mismatch';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF NEW.rescheduled_from_booking_id IS NOT NULL THEN` | `` | — | — |
| `        SELECT tb.org_id INTO parent_org FROM public.tour_bookings tb WHERE tb.id = NEW.rescheduled_from_booking_id;` | `` | — | — |
| `        IF parent_org IS NULL THEN` | `` | — | — |
| `        END IF;` | `` | — | — |
| `        IF parent_org IS DISTINCT FROM NEW.org_id THEN` | `` | — | — |
| `            RAISE EXCEPTION 'tour_bookings: rescheduled_from_booking_id org_id mismatch';` | `` | — | — |
| `        END IF;` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    opp_org uuid;` | `` | — | — |
| `    loc_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.opportunity_id;` | `` | — | — |
| `    IF opp_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF opp_org IS DISTINCT FROM NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'tour_public_booking_links: opportunity org_id mismatch';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    SELECT l.org_id INTO loc_org FROM public.locations l WHERE l.id = NEW.location_id;` | `` | — | — |
| `    IF loc_org IS NULL THEN` | `` | — | — |
| `    END IF;` | `` | — | — |
| `    IF loc_org IS DISTINCT FROM NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'tour_public_booking_links: location org_id mismatch';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    d_org uuid;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    SELECT d.org_id INTO d_org` | `` | — | — |
| `    FROM public.departments AS d` | `` | — | — |
| `    WHERE d.id = NEW.department_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF d_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF d_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'user_department_access: org_id on row (%) must match departments.org_id (%) for department_id %'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `DECLARE` | `` | — | — |
| `    loc_org uuid;` | `` | — | — |
| `    loc_type text;` | `` | — | — |
| `BEGIN` | `` | — | — |
| `    FROM public.locations AS l` | `` | — | — |
| `    WHERE l.id = NEW.location_id;` | `` | — | — |
| `public` | `` | — | — |
| `    IF loc_org IS NULL THEN` | `` | — | — |
| `            USING ERRCODE = '23503';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF loc_org <> NEW.org_id THEN` | `` | — | — |
| `        RAISE EXCEPTION 'user_site_access: org_id on row (%) must match locations.org_id (%) for location_id %'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    IF loc_type IS DISTINCT FROM 'site'::text THEN` | `` | — | — |
| `        RAISE EXCEPTION 'user_site_access: location_id % must have location_type = site (got %)'` | `` | — | — |
| `            USING ERRCODE = '23514';` | `` | — | — |
| `    END IF;` | `` | — | — |
| `public` | `` | — | — |
| `    RETURN NEW;` | `` | — | — |
| `END;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| ` RETURNS trigger` | `` | — | — |
| ` LANGUAGE plpgsql` | `` | — | — |
| `AS $function$` | `` | — | — |
| `begin` | `` | — | — |
| `  if new.org_id is null then` | `` | — | — |
| `  end if;` | `` | — | — |
| `  return new;` | `` | — | — |
| `end;` | `` | — | — |
| `$function$` | `` | — | — |
| `public` | `` | — | — |
| `  IF coalesce(trim(p_frequency_key)` | ` '') <> '' THEN` | — | — |
| `    SELECT coalesce(wu.queue_definition` | ` '{}'::jsonb)` | — | — |
| `        COALESCE(p -> 'values'` | ` '{}'::jsonb)` | — | — |
| `        COALESCE(p -> 'signatures'` | ` '{}'::jsonb)` | — | — |
| `        COALESCE(p -> 'option_values_by_field_id'` | ` '{}'::jsonb)` | — | — |
| `    (p_org_id` | ` 'admin'` | — | — |
| `  select p_org_id` | ` 'admin'` | — | — |
| `        NEW.customer_number := public.next_org_scoped_record_number(NEW.org_id` | ` 'customer');` | — | — |
| `      ' | Add-ons: $' || to_char(v_addons/100.0` | ` 'FM999990.00')` | — | — |
| `    ' | First cleaning (base): $' || to_char(v_first/100.0` | ` 'FM999990.00') ||` | — | — |
| `    ' | First visit total: $' || to_char((v_first + v_addons)/100.0` | ` 'FM999990.00') ||` | — | — |
| `      to_char(v_recurring/100.0` | ` 'FM999990.00') || ' / visit' ||` | — | — |
| `        NEW.job_number := public.next_org_scoped_record_number(NEW.org_id` | ` 'job');` | — | — |
| `        NEW.location_number := public.next_org_scoped_record_number(NEW.org_id` | ` 'location');` | — | — |
| `    ('ops.contacts.write'` | ` 'Manage contacts'` | — | — |
| `    ('ops.customers.write'` | ` 'Manage customers'` | — | — |
| `    ('fin.write'` | ` 'Manage financials'` | — | — |
| `    ('ops.jobs.write'` | ` 'Manage jobs'` | — | — |
| `    ('ops.locations.write'` | ` 'Manage locations'` | — | — |
| `    ('ops.opportunities.write'` | ` 'Manage opportunities'` | — | — |
| `    ('admin.roles.write'` | ` 'Manage roles & permissions'` | — | — |
| `    ('ops.schedules.write'` | ` 'Manage schedules'` | — | — |
| `    ('admin.users.write'` | ` 'Manage users'` | — | — |
| `    ('ops.workflows.write'` | ` 'Manage workflows'` | — | — |
| `  IF lower(p_service_key) IN ('move_out_heavy'` | ` 'move-out'` | — | — |
| `        NEW.opportunity_number := public.next_org_scoped_record_number(NEW.org_id` | ` 'opportunity');` | — | — |
| `    (p_org_id` | ` 'ops'` | — | — |
| `  select p_org_id` | ` 'ops'` | — | — |
| `  values (new.id` | ` 'ops');` | — | — |
| `        NEW.person_number := public.next_org_scoped_record_number(NEW.org_id` | ` 'person');` | — | — |
| ` SET search_path TO 'public'` | ` 'pg_temp'` | — | — |
| ` SET search_path TO 'public'` | ` 'pg_temp'` | — | — |
| ` SET search_path TO 'public'` | ` 'pg_temp'` | — | — |
| ` SET search_path TO 'public'` | ` 'pg_temp'` | — | — |
| ` SET search_path TO 'public'` | ` 'pg_temp'` | — | — |
| `        NEW.schedule_number := public.next_org_scoped_record_number(NEW.org_id` | ` 'schedule');` | — | — |
| `    ('ops.messaging.write'` | ` 'Send/manage messages'` | — | — |
| `          AND css.source = ANY (ARRAY['task_assist'::text` | ` 'tour_scheduling'::text])  -- announcement execution: Phase 3` | — | — |
| `    before_h := encode(extensions.digest(convert_to(cur::text` | ` 'UTF8')` | — | — |
| `    after_h := encode(extensions.digest(convert_to(p_queue_definition::text` | ` 'UTF8')` | — | — |
| `        before_h := encode(extensions.digest(convert_to('{}'::jsonb::text` | ` 'UTF8')` | — | — |
| `        after_h := encode(extensions.digest(convert_to(p_config::text` | ` 'UTF8')` | — | — |
| `        before_h := encode(extensions.digest(convert_to(cur::text` | ` 'UTF8')` | — | — |
| `        after_h := encode(extensions.digest(convert_to(p_config::text` | ` 'UTF8')` | — | — |
| `    before_h := encode(extensions.digest(convert_to(before_vis::text` | ` 'UTF8')` | — | — |
| `    after_h := encode(extensions.digest(convert_to(after_vis::text` | ` 'UTF8')` | — | — |
| `        NEW.vendor_number := public.next_org_scoped_record_number(NEW.org_id` | ` 'vendor');` | — | — |
| `    ('ops.contacts.read'` | ` 'View contacts'` | — | — |
| `    ('ops.customers.read'` | ` 'View customers'` | — | — |
| `    ('fin.read'` | ` 'View financials'` | — | — |
| `    ('ops.jobs.read'` | ` 'View jobs'` | — | — |
| `    ('ops.locations.read'` | ` 'View locations'` | — | — |
| `    ('ops.messaging.read'` | ` 'View messaging/outbox'` | — | — |
| `    ('ops.opportunities.read'` | ` 'View opportunities'` | — | — |
| `    ('admin.roles.read'` | ` 'View roles & permissions'` | — | — |
| `    ('ops.schedules.read'` | ` 'View schedules'` | — | — |
| `    ('admin.users.read'` | ` 'View users'` | — | — |
| `    ('ops.workflows.read'` | ` 'View workflows'` | — | — |
| `        IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = ANY (ARRAY['draft'::text` | ` 'void'::text]) THEN` | — | — |
| `    'SELECT COALESCE(MAX(%I)` | ` 0::bigint) + 1 FROM public.%I WHERE org_id = $1'` | — | — |
| `        coalesce((p_queue_definition->>'version')::integer` | ` 0)` | — | — |
| `        coalesce((p_config->>'version')::integer` | ` 0)` | — | — |
| `  v_job_number := coalesce(v_completed_count` | ` 0) + 1;` | — | — |
| `  SELECT coalesce(sum(pa.amount_cents)` | ` 0) INTO v_addons` | — | — |
| `    v_old := coalesce((cur->>'version')::integer` | ` 0);` | — | — |
| `        v_old := coalesce((cur->>'version')::integer` | ` 0);` | — | — |
| `    AND (coalesce(array_length(p_addon_keys` | ` 1)` | — | — |
| `    return query select 9000` | ` 1000; -- job 11+` | — | — |
| `    return query select 8000` | ` 2000; -- jobs 2-10` | — | — |
| `    return query select 7000` | ` 3000; -- job 1` | — | — |
| `    SELECT a.org_id` | ` a.customer_member_id` | — | — |
| `    SELECT a.org_id` | ` a.customer_member_id` | — | — |
| `    SELECT a.org_id` | ` a.customer_member_id` | — | — |
| `    INTO agr_org` | ` agr_member` | — | — |
| `    INTO agr_org` | ` agr_member` | — | — |
| `    INTO agr_org` | ` agr_member` | — | — |
| `  select contractor_bps` | ` alloy_bps` | — | — |
| ` RETURNS TABLE(contractor_bps integer` | ` alloy_bps integer)` | — | — |
| `  -- If the OLD row is completed` | ` block historical rewrites` | — | — |
| `    SELECT c.org_id` | ` c.opportunity_id INTO cand_org` | — | — |
| `    SELECT c.org_id` | ` c.program_room_cohort_key` | — | — |
| `    INTO cand_org` | ` cand_cohort` | — | — |
| `    SELECT cm.org_id` | ` cm.customer_id` | — | — |
| `    SELECT cm.org_id` | ` cm.customer_id` | — | — |
| `        SELECT cm.org_id` | ` cm.customer_id` | — | — |
| `    SELECT rol.id` | ` coalesce(rol.config` | — | — |
| `  -- contractor_payout: Dr Contractor COGS` | ` Cr Contractor Payable (or Cash if you pay immediately)` | — | — |
| `  -- customer_charge (Stripe): Dr Stripe Clearing` | ` Cr Revenue (Gross)` | — | — |
| `  -- processing_fee: Dr Processing Fees` | ` Cr Stripe Clearing` | — | — |
| `        ORDER BY css.scheduled_for ASC` | ` css.id ASC` | — | — |
| `    INTO layout_id` | ` cur` | — | — |
| `            RAISE EXCEPTION 'schedule_patterns.weekdays element % out of range 0-6'` | ` d` | — | — |
| `            NEW.org_id` | ` d_org` | — | — |
| `        SELECT e.org_id` | ` e.enrollment_agreement_id INTO c_org` | — | — |
| `  -- prefer gross_price_cents if provided` | ` else fall back to estimated_total_cents.` | — | — |
| `    -- If the opportunity is linked to a family/customer` | ` enforce member belongs to same family.` | — | — |
| `        INSERT INTO public.record_overview_layouts (org_id` | ` entity_type` | — |  is_active) |
| `    org_id` | ` entry_date` |  metadata |  source_type |
| `      (org_id` | ` entry_id` |  job_id |  credit_cents |
| `      (org_id` | ` entry_id` |  job_id |  credit_cents |
| `      (org_id` | ` entry_id` |  job_id |  credit_cents |
| `  SELECT 'first_clean'::text` | ` fc.service_key` | — |  fc.matrix_cents |
| `    v_lock := coalesce(fd.updated_at` | ` fd.created_at);` | — | — |
| `        'is_visible_in_drawer'` | ` fd.is_visible_in_drawer` | — | — |
| `        'is_visible_in_form'` | ` fd.is_visible_in_form` | — | — |
| `        'is_visible_in_public_booking'` | ` fd.is_visible_in_public_booking` | — | — |
| `        'is_visible_in_table'` | ` fd.is_visible_in_table` | — | — |
| `    SELECT g.org_id` | ` g.opportunity_id INTO grp_org` | — | — |
| `      RAISE EXCEPTION 'next_org_scoped_record_number: unknown entity % (expected customer` | ` job` |  p_entity; |  vendor |
| `            SELECT l.org_id` | ` l.location_type` | — | — |
| `    SELECT l.org_id` | ` l.location_type` | — | — |
| `    SELECT l.org_id` | ` l.location_type` | — | — |
| `        SELECT l.org_id` | ` l.location_type` | — | — |
| `        SELECT l.org_id` | ` l.location_type` | — | — |
| `    SELECT l.org_id` | ` l.location_type` | — | — |
| `    SELECT l.org_id` | ` l.location_type` | — | — |
| `    SELECT l.org_id` | ` l.location_type INTO site_org` | — | — |
| `        SELECT l.org_id` | ` l.location_type INTO site_org` | — | — |
| `  insert into public.permission_keys (key` | ` label` | — | — |
| `            NEW.org_id` | ` loc_org` | — | — |
| `    INTO loc_org` | ` loc_type` | — | — |
| `            NEW.location_id` | ` loc_type` | — | — |
| `        SELECT lpc.org_id` | ` lpc.location_id` | — | — |
| `    INTO mem_org` | ` mem_customer` | — | — |
| `    INTO mem_org` | ` mem_customer` | — | — |
| `        RAISE EXCEPTION 'opportunity_customer_members: customer_member.customer_id % does not match opportunity.customer_id %'` | ` mem_customer` | — | — |
| `        INTO mem_org` | ` mem_customer` | — | — |
| `        RAISE EXCEPTION 'opportunity_customer_members: org_id mismatch (row %` | ` member %)'` | — | — |
| `            RAISE EXCEPTION 'child_attendance_events: corrects_event_id % not found'` | ` NEW.corrects_event_id USING ERRCODE = '23503';` | — | — |
| `        RAISE EXCEPTION 'child_enrollment_agreements: customer_member_id % not found'` | ` NEW.customer_member_id` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: customer_member_id % not found'` | ` NEW.customer_member_id` | — | — |
| `        RAISE EXCEPTION 'opportunity_customer_members: customer_member_id % not found'` | ` NEW.customer_member_id;` | — | — |
| `        RAISE EXCEPTION 'user_department_access: department_id % does not exist'` | ` NEW.department_id` | — | — |
| `        RAISE EXCEPTION 'form_submission_documents: document_id % not found'` | ` NEW.document_id;` | — | — |
| `        RAISE EXCEPTION 'child_attendance_events: enrollment_agreement_id % not found'` | ` NEW.enrollment_agreement_id` | — | — |
| `        RAISE EXCEPTION 'child_placements: enrollment_agreement_id % not found'` | ` NEW.enrollment_agreement_id` | — | — |
| `        RAISE EXCEPTION 'schedule_assignments: enrollment_agreement_id % not found'` | ` NEW.enrollment_agreement_id` | — | — |
| `        RAISE EXCEPTION 'task_assist_proposals: entity_id % not found'` | ` NEW.entity_id USING ERRCODE = '23503';` | — | — |
| `  v_gross := coalesce(new.gross_price_cents` | ` new.estimated_total_cents);` | — | — |
| `  new.full_name := nullif(trim(concat_ws(' '` | ` new.first_name` | — | — |
| `        RAISE EXCEPTION 'form_definition_versions: form_definition_id % not found'` | ` NEW.form_definition_id;` | — | — |
| `        RAISE EXCEPTION 'form_packet_items: form_definition_id % not found'` | ` NEW.form_definition_id;` | — | — |
| `        RAISE EXCEPTION 'form_public_links: form_definition_id % not found'` | ` NEW.form_definition_id;` | — | — |
| `            RAISE EXCEPTION 'tour_bookings: form_public_link_id % not found'` | ` NEW.form_public_link_id;` | — | — |
| `        RAISE EXCEPTION 'form_submission_documents: submission % not found'` | ` NEW.form_submission_id;` | — | — |
| `        RAISE EXCEPTION 'form_submission_signatures: submission % not found'` | ` NEW.form_submission_id;` | — | — |
| `            RAISE EXCEPTION 'tour_bookings: form_submission_id % not found'` | ` NEW.form_submission_id;` | — | — |
| `            WHERE l.id = ANY (ARRAY[NEW.room_location_id` | ` NEW.from_room_location_id` | — | — |
| `        RAISE EXCEPTION 'user_site_access: location_id % does not exist'` | ` NEW.location_id` | — | — |
| `        RAISE EXCEPTION 'tour_availability_rules: location_id % not found'` | ` NEW.location_id;` | — | — |
| `        RAISE EXCEPTION 'tour_bookings: location_id % not found'` | ` NEW.location_id;` | — | — |
| `        RAISE EXCEPTION 'tour_public_booking_links: location_id % not found'` | ` NEW.location_id;` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: opportunity_customer_member_id % not found'` | ` NEW.opportunity_customer_member_id` | — | — |
| `            RAISE EXCEPTION 'child_enrollment_agreements: opportunity_id % not found'` | ` NEW.opportunity_id` | — | — |
| `        RAISE EXCEPTION 'placement_candidates: opportunity_id % not found'` | ` NEW.opportunity_id` | — | — |
| `        RAISE EXCEPTION 'placement_link_groups: opportunity_id % not found'` | ` NEW.opportunity_id USING ERRCODE = '23503';` | — | — |
| `        RAISE EXCEPTION 'opportunity_customer_members: opportunity_id % not found'` | ` NEW.opportunity_id;` | — | — |
| `        RAISE EXCEPTION 'opportunity_persons: opportunity_id % not found'` | ` NEW.opportunity_id;` | — | — |
| `        RAISE EXCEPTION 'tour_bookings: opportunity_id % not found'` | ` NEW.opportunity_id;` | — | — |
| `        RAISE EXCEPTION 'tour_public_booking_links: opportunity_id % not found'` | ` NEW.opportunity_id;` | — | — |
| `        RAISE EXCEPTION 'form_packet_items: packet_definition_id % not found'` | ` NEW.packet_definition_id;` | — | — |
| `    raise exception 'Parent location % not found'` | ` new.parent_location_id;` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: person_id % not found'` | ` NEW.person_id USING ERRCODE = '23503';` | — | — |
| `        RAISE EXCEPTION 'opportunity_persons: person_id % not found'` | ` NEW.person_id;` | — | — |
| `            RAISE EXCEPTION 'form_public_links: pinned_form_definition_version_id % not found'` | ` NEW.pinned_form_definition_version_id;` | — | — |
| `        RAISE EXCEPTION 'placement_link_group_members: candidate % not found'` | ` NEW.placement_candidate_id USING ERRCODE = '23503';` | — | — |
| `        RAISE EXCEPTION 'placement_overrides: candidate % not found'` | ` NEW.placement_candidate_id USING ERRCODE = '23503';` | — | — |
| `        RAISE EXCEPTION 'placement_link_group_members: group % not found'` | ` NEW.placement_link_group_id USING ERRCODE = '23503';` | — | — |
| `            RAISE EXCEPTION 'child_placements: program_category_id % not found'` | ` NEW.program_category_id` | — | — |
| `            RAISE EXCEPTION 'childcare config scope: program_category_id % not found'` | ` NEW.program_category_id` | — | — |
| `            RAISE EXCEPTION 'tour_bookings: rescheduled_from_booking_id % not found'` | ` NEW.rescheduled_from_booking_id;` | — | — |
| `            RAISE EXCEPTION 'child_placements: room_location_id % not found'` | ` NEW.room_location_id` | — | — |
| `            RAISE EXCEPTION 'child_placements: room_location_id % must be location_type unit'` | ` NEW.room_location_id` | — | — |
| `            RAISE EXCEPTION 'childcare config scope: room_location_id % not found'` | ` NEW.room_location_id` | — | — |
| `        RAISE EXCEPTION 'schedule_assignments: schedule_pattern_id % not found'` | ` NEW.schedule_pattern_id` | — | — |
| `            RAISE EXCEPTION 'placement_candidates: site_id % not found'` | ` NEW.site_id USING ERRCODE = '23503';` | — | — |
| `        RAISE EXCEPTION 'child_enrollment_agreements: site_location_id % not found'` | ` NEW.site_location_id` | — | — |
| `        RAISE EXCEPTION 'child_placements: invalid site_location_id %'` | ` NEW.site_location_id` | — | — |
| `                NEW.room_location_id` | ` NEW.site_location_id` | — | — |
| `            RAISE EXCEPTION 'childcare config scope: site_location_id % not found'` | ` NEW.site_location_id` | — | — |
| `        RAISE EXCEPTION 'schedule_patterns: site_location_id % not found'` | ` NEW.site_location_id` | — | — |
| `        RAISE EXCEPTION 'child_attendance_events: invalid site_location_id %'` | ` NEW.site_location_id USING ERRCODE = '23514';` | — | — |
| `  values (new.customer_id` | ` new.vertical_id` | — | — |
| `      values (new.customer_id` | ` new.vertical_id` | — | — |
| `    RAISE EXCEPTION 'jobs.work_unit_id % does not reference an existing work unit'` | ` NEW.work_unit_id` | — | — |
| `    RAISE EXCEPTION 'opportunities.work_unit_id % does not reference an existing work unit'` | ` NEW.work_unit_id` | — | — |
| `        -- revert to draft or void in place (void = a reversal row` | ` not an edit).` | — | — |
| `        SELECT o.org_id` | ` o.customer_id` | — | — |
| `    SELECT o.org_id` | ` o.customer_id` | — | — |
| `    SELECT o.org_id` | ` o.customer_id` | — | — |
| `    SELECT o.org_id` | ` o.customer_id INTO opp_org` | — | — |
| `        INTO ocm_org` | ` ocm_opp` | — | — |
| `        INTO ocm_org` | ` ocm_opp` | — | — |
| `        SELECT ocm.org_id` | ` ocm.opportunity_id` | — | — |
| `        SELECT ocm.org_id` | ` ocm.opportunity_id` | — | — |
| `            RAISE EXCEPTION 'posted childcare charge % is immutable: DELETE not allowed; record a reversal/credit/replacement via source_charge_id'` | ` OLD.id` | — | — |
| `            RAISE EXCEPTION 'posted childcare charge % is immutable: financial fields cannot change in place; record a reversal/credit/replacement via source_charge_id'` | ` OLD.id` | — | — |
| `            RAISE EXCEPTION 'posted childcare charge % cannot transition to % in place; record a reversal via source_charge_id'` | ` OLD.id` | — | — |
| `        RAISE EXCEPTION 'opportunity_customer_members: org_id mismatch (row %` | ` opp %)'` | — | — |
| `        INTO opp_org` | ` opp_customer` | — | — |
| `    INTO opp_org` | ` opp_customer` | — | — |
| `    INTO opp_org` | ` opp_customer` | — | — |
| `        RAISE EXCEPTION 'opportunity_persons: org_id mismatch (row %` | ` opportunity %)'` | — | — |
| ` RETURNS TABLE(out_vertical_slug text` | ` out_service_key text` |  total_first_visit_cents integer |  recurring_cents integer |
| `        VALUES (p_org_id` | ` p_entity_type` | — |  true) |
| `        'is_visible_in_drawer'` | ` p_is_visible_in_drawer` | — | — |
| `        'is_visible_in_form'` | ` p_is_visible_in_form` | — | — |
| `        'is_visible_in_public_booking'` | ` p_is_visible_in_public_booking` | — | — |
| `        'is_visible_in_table'` | ` p_is_visible_in_table` | — | — |
| `    raise exception 'ledger tx not found: %'` | ` p_ledger_tx_id;` | — | — |
| `    RAISE EXCEPTION 'Unknown service_key for %: %'` | ` p_vertical_slug` | — | — |
| `    RAISE EXCEPTION 'Unknown sqft tier_key for %: %'` | ` p_vertical_slug` | — | — |
| `    RAISE EXCEPTION 'Missing first_clean price for % / % / %'` | ` p_vertical_slug` | — | — |
| `    RAISE EXCEPTION 'Missing first_clean price for % / % / %'` | ` p_vertical_slug` | — | — |
| `    RAISE EXCEPTION 'Missing first_clean price for % / % / %'` | ` p_vertical_slug` | — | — |
| `    RAISE EXCEPTION 'Missing first_clean price for % / % / %'` | ` p_vertical_slug` | — | — |
| `    RAISE EXCEPTION 'Unknown vertical slug: %'` | ` p_vertical_slug;` | — | — |
| `  SELECT p.slice_kind` | ` p.service_key` | — |  p.matrix_cents |
| `  SELECT p.slice_kind` | ` p.service_key` | — |  p.matrix_cents |
| `  SELECT p.slice_kind` | ` p.service_key` | — |  p.matrix_cents |
| `    raise exception 'Parent location org_id % does not match child org_id %'` | ` parent_org` | — | — |
| `    INTO pat_org` | ` pat_site` | — | — |
| `        RAISE EXCEPTION 'opportunity_persons: org_id mismatch (row %` | ` person %)'` | — | — |
| `    SELECT pf.id` | ` pf.frequency_label` | — | — |
| `        ORDER BY pm.sort_order NULLS LAST` | ` pm.id` | — | — |
| `        ORDER BY pm.sort_order NULLS LAST` | ` pm.id` | — | — |
| `  ORDER BY pm.sort_order NULLS LAST` | ` pm.id` | — | — |
| `  ORDER BY pm.sort_order NULLS LAST` | ` pm.id` | — | — |
| `        INTO prog_org` | ` prog_site` | — | — |
| `        FOR r_org` | ` r_type` | — | — |
| `  SELECT 'recurring'::text` | ` r.service_key` | — |  r.matrix_cents |
| `  -- idempotent: if already posted` | ` return existing` | — | — |
| `  insert into public.role_definitions (org_id` | ` role_key` | — | — |
| `  insert into public.role_permission_grants (org_id` | ` role_key` | — | — |
| `  on conflict (org_id` | ` role_key` | — | — |
| `  insert into public.role_permission_grants (org_id` | ` role_key` | — | — |
| `  on conflict (org_id` | ` role_key` | — | — |
| `  on conflict (org_id` | ` role_key) do nothing;` | — | — |
| `  insert into public.user_profiles (id` | ` role)` | — | — |
| `        INTO room_org` | ` room_type` | — | — |
| `        INTO room_org` | ` room_type` | — | — |
| `                NEW.room_location_id` | ` room_type USING ERRCODE = '23514';` | — | — |
| ` RETURNS TABLE(slice_kind text` | ` service_key text` | — |  matrix_cents integer |
| `    INTO site_org` | ` site_type` | — | — |
| `            NEW.site_location_id` | ` site_type` | — | — |
| `    INTO site_org` | ` site_type` | — | — |
| `    INTO site_org` | ` site_type` | — | — |
| `            NEW.site_location_id` | ` site_type` | — | — |
| `                NEW.site_location_id` | ` site_type USING ERRCODE = '23514';` | — | — |
| `  SELECT ps.service_offering_id` | ` so.org_id` | — | — |
| `    SELECT sp.org_id` | ` sp.site_location_id` | — | — |
| `  SELECT st.id` | ` st.dimension_value_id INTO v_sqft_tier_id` | — | — |
| `    SELECT st.id AS tier_id` | ` st.tier_key` | — | — |
| `    RAISE EXCEPTION 'child_attendance_events is append-only: % is not allowed. Record a correction or reversal event instead.'` | ` TG_OP` | — | — |
| `      RAISE EXCEPTION 'trg_assign_org_scoped_record_number: unexpected table %'` | ` TG_TABLE_NAME::text;` | — | — |
| `    into v_contractor_bps` | ` v_alloy_bps` | — | — |
| `      (v_tx.org_id` | ` v_entry_id` |  v_tx.job_id |  0 |
| `      (v_tx.org_id` | ` v_entry_id` |  v_tx.job_id |  v_tx.amount_cents |
| `      (v_tx.org_id` | ` v_entry_id` |  v_tx.job_id |  0 |
| `      (v_tx.org_id` | ` v_entry_id` |  v_tx.job_id |  v_tx.amount_cents |
| `      (v_tx.org_id` | ` v_entry_id` |  v_tx.job_id |  0 |
| `      (v_tx.org_id` | ` v_entry_id` |  v_tx.job_id |  v_tx.amount_cents |
| `      INTO v_frequency_id` | ` v_freq_label` | — | — |
| `    INTO v_service_offering_id` | ` v_org_id` | — | — |
| `    jsonb_build_object('ledger_transaction_id'` | ` v_tx.id)` | — | — |
| `    raise exception 'missing required GL mappings for org %'` | ` v_tx.org_id;` | — | — |
| `      raise exception 'missing contractor mappings (contractor_payable/contractor_cogs) for org %'` | ` v_tx.org_id;` | — | — |
| `      raise exception 'missing processing_fees mapping for org %'` | ` v_tx.org_id;` | — | — |
| `    raise exception 'unsupported ledger tx type: %'` | ` v_tx.type;` | — | — |
| `    coalesce(v_tx.metadata->>'description'` | ` v_tx.type)` | — | — |
| `    SELECT v.form_definition_id` | ` v.org_id INTO v_def` | — | — |
| `        SELECT v.form_definition_id` | ` v.org_id INTO ver_form` | — | — |
| `        SELECT v.form_definition_id` | ` v.org_id INTO ver_form` | — | — |
| `  insert into public.customer_vertical_job_counters (customer_id` | ` vertical_id` | — | — |
| `      insert into public.customer_vertical_job_counters (customer_id` | ` vertical_id` | — | — |
| `      on conflict (customer_id` | ` vertical_id)` | — | — |
| `  on conflict (customer_id` | ` vertical_id) do nothing;` | — | — |
| `        RAISE EXCEPTION 'form_submissions: form_definition_version_id % not found'` | ` vid;` | — | — |
| `      NEW.org_id` | ` w_org` | — | — |
| `      NEW.org_id` | ` w_org` | — | — |
| `      ' | Recurring (' || coalesce(v_freq_label` | `'') || '): $' ||` | — | — |
| `    new.org_id := nullif(new.event_payload->>'org_id'` | `'')::uuid;` | — | — |
| `    and pk.key not in ('admin.users.write'` | `'admin.roles.write')` | — | — |
| `public` | `agent_v0_commit_queue_definition_apply` | jsonb | true |
| `public` | `agent_v1_commit_record_overview_layout_apply` | jsonb | true |
| `public` | `agent_v2_commit_field_visibility_apply` | jsonb | true |
| `public` | `audit_cleaning_quote_pricing_matrix_legacy_parity` | record | true |
| `public` | `bump_communication_thread_last_message_at` | trigger | false |
| `public` | `claim_due_communication_scheduled_sends` | communication_scheduled_sends | false |
| `public` | `current_org_id` | uuid | true |
| `public` | `discounted_cents` | integer | false |
| `public` | `enforce_childcare_charge_immutability` | trigger | false |
| `public` | `enforce_communication_scheduled_sends_org_matches_entities` | trigger | false |
| `public` | `enforce_form_definition_versions_immutability` | trigger | false |
| `public` | `enforce_form_submissions_submitted_immutability` | trigger | false |
| `public` | `enforce_jobs_work_unit_same_org` | trigger | false |
| `public` | `enforce_operational_tasks_org_matches_opportunity` | trigger | false |
| `public` | `enforce_opportunities_work_unit_same_org` | trigger | false |
| `public` | `enforce_task_assist_proposals_org_matches_opportunity` | trigger | false |
| `public` | `ensure_vendor_primary_contact_link` | trigger | false |
| `public` | `fn_job_split_bps` | record | false |
| `public` | `form_submission_canonical_capture` | jsonb | false |
| `public` | `get_quote_pricing` | record | true |
| `public` | `handle_new_user` | trigger | false |
| `public` | `has_org_role` | boolean | false |
| `public` | `is_admin` | boolean | false |
| `public` | `is_org_member` | boolean | true |
| `public` | `locations_parent_same_org` | trigger | false |
| `public` | `next_org_scoped_record_number` | bigint | true |
| `public` | `post_ledger_transaction` | uuid | true |
| `public` | `post_payment_to_ledger` | void | true |
| `public` | `prevent_child_attendance_events_mutation` | trigger | false |
| `public` | `prevent_completed_schedule_history_rewrite` | trigger | false |
| `public` | `round_to_nearest_5_cents` | integer | false |
| `public` | `scaled_base_cents` | integer | false |
| `public` | `seed_default_rbac` | void | true |
| `public` | `set_person_full_name` | trigger | false |
| `public` | `set_updated_at` | trigger | false |
| `public` | `set_updated_at_opportunities` | trigger | false |
| `public` | `sync_communication_template_version_legacy` | trigger | false |
| `public` | `sync_form_definition_versions_org_id` | trigger | false |
| `public` | `sync_form_packet_items_org_from_packet` | trigger | false |
| `public` | `sync_form_packet_session_items_org_from_session` | trigger | false |
| `public` | `sync_form_packet_sessions_org_from_packet_def` | trigger | false |
| `public` | `sync_form_public_links_org_from_definition` | trigger | false |
| `public` | `sync_form_submission_documents_org_from_submission` | trigger | false |
| `public` | `sync_form_submission_signatures_org_from_submission` | trigger | false |
| `public` | `sync_form_submissions_org_and_definition_from_version` | trigger | false |
| `public` | `trg_assign_org_scoped_record_number` | trigger | true |
| `public` | `trg_jobs_assign_pricing_tier` | trigger | false |
| `public` | `trg_jobs_increment_completed_counter` | trigger | false |
| `public` | `trg_post_payment_to_ledger` | trigger | false |
| `public` | `user_belongs_to_org` | boolean | true |
| `public` | `validate_child_attendance_events_consistency` | trigger | false |
| `public` | `validate_child_enrollment_agreements_consistency` | trigger | false |
| `public` | `validate_child_placements_consistency` | trigger | false |
| `public` | `validate_childcare_config_scope` | trigger | false |
| `public` | `validate_form_packet_items_form_org` | trigger | false |
| `public` | `validate_form_packet_session_items_packet_match` | trigger | false |
| `public` | `validate_form_packet_session_items_submission_org` | trigger | false |
| `public` | `validate_form_packet_sessions_link_org` | trigger | false |
| `public` | `validate_form_public_links_consistency` | trigger | false |
| `public` | `validate_form_submission_documents_org_matches_document` | trigger | false |
| `public` | `validate_form_submission_signatures_drawn_asset_org` | trigger | false |
| `public` | `validate_opportunity_customer_members_consistency` | trigger | false |
| `public` | `validate_opportunity_persons_consistency` | trigger | false |
| `public` | `validate_placement_candidates_consistency` | trigger | false |
| `public` | `validate_placement_link_group_members_consistency` | trigger | false |
| `public` | `validate_placement_link_groups_consistency` | trigger | false |
| `public` | `validate_placement_overrides_consistency` | trigger | false |
| `public` | `validate_schedule_assignments_consistency` | trigger | false |
| `public` | `validate_schedule_patterns_consistency` | trigger | false |
| `public` | `validate_schedule_patterns_weekdays` | trigger | false |
| `public` | `validate_tour_availability_rules_location_org` | trigger | false |
| `public` | `validate_tour_booking_org_integrity` | trigger | false |
| `public` | `validate_tour_public_booking_link_scope` | trigger | false |
| `public` | `validate_user_department_access_org_match` | trigger | false |
| `public` | `validate_user_site_access_site_and_org` | trigger | false |
| `public` | `workflow_runs_set_org_id` | trigger | false |

> Full argument lists and bodies: inspect `docs/supabase/reference/supabase_functions.csv` or Supabase SQL editor.
