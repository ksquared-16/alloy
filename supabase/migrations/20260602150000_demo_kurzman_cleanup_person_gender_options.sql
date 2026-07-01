-- Demo cleanup: remove Wrigley Kurzman (child) and Kelly Kurzman (parent) from Alloy Bend staging org.
-- Promote Kevin Mitchell to household primary contact where those records were linked.
-- Normalize person_gender option set to Male / Female / Not Specified (config-driven drawers).

DO $$
DECLARE
    v_org uuid := '7803388d-cdee-4afb-89cf-23a137f39423'::uuid;
    v_kevin_id uuid;
    v_remove_person_ids uuid[];
    v_remove_member_ids uuid[];
    v_affected_customer_ids uuid[];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = v_org) THEN
        RAISE NOTICE 'demo_kurzman_cleanup: org % not found — skipping', v_org;
        RETURN;
    END IF;

    SELECT array_agg(p.id ORDER BY p.created_at)
    INTO v_remove_person_ids
    FROM public.persons p
    WHERE p.org_id = v_org
      AND (
          (lower(trim(coalesce(p.first_name, ''))) = 'kelly' AND lower(trim(coalesce(p.last_name, ''))) = 'kurzman')
          OR (lower(trim(coalesce(p.first_name, ''))) = 'wrigley' AND lower(trim(coalesce(p.last_name, ''))) = 'kurzman')
      );

    v_remove_person_ids := coalesce(v_remove_person_ids, ARRAY[]::uuid[]);

    SELECT array_agg(cm.id ORDER BY cm.created_at)
    INTO v_remove_member_ids
    FROM public.customer_members cm
    WHERE cm.org_id = v_org
      AND (
          lower(trim(coalesce(cm.display_name, ''))) IN ('wrigley kurzman', 'wrigley')
          OR cm.person_id = ANY (v_remove_person_ids)
      );

    v_remove_member_ids := coalesce(v_remove_member_ids, ARRAY[]::uuid[]);

    SELECT p.id
    INTO v_kevin_id
    FROM public.persons p
    WHERE p.org_id = v_org
      AND lower(trim(coalesce(p.first_name, ''))) = 'kevin'
      AND lower(trim(coalesce(p.last_name, ''))) = 'mitchell'
    ORDER BY p.created_at
    LIMIT 1;

    SELECT array_agg(DISTINCT x.customer_id)
    INTO v_affected_customer_ids
    FROM (
        SELECT cp.customer_id
        FROM public.customer_persons cp
        WHERE cp.org_id = v_org
          AND cp.person_id = ANY (v_remove_person_ids)
        UNION
        SELECT cm.customer_id
        FROM public.customer_members cm
        WHERE cm.org_id = v_org
          AND cm.id = ANY (v_remove_member_ids)
        UNION
        SELECT cp.customer_id
        FROM public.customer_persons cp
        WHERE cp.org_id = v_org
          AND v_kevin_id IS NOT NULL
          AND cp.person_id = v_kevin_id
    ) x;

    v_affected_customer_ids := coalesce(v_affected_customer_ids, ARRAY[]::uuid[]);

    IF cardinality(v_remove_person_ids) = 0 AND cardinality(v_remove_member_ids) = 0 THEN
        RAISE NOTICE 'demo_kurzman_cleanup: no Kurzman demo rows found in org %', v_org;
    ELSE
        -- Opportunity inquiry children / enrollment mirror source rows.
        DELETE FROM public.opportunity_customer_members ocm
        WHERE ocm.org_id = v_org
          AND ocm.customer_member_id = ANY (v_remove_member_ids);

        DELETE FROM public.opportunity_persons op
        WHERE op.org_id = v_org
          AND op.person_id = ANY (v_remove_person_ids);

        IF v_kevin_id IS NOT NULL AND cardinality(v_affected_customer_ids) > 0 THEN
            UPDATE public.opportunities o
            SET primary_person_id = v_kevin_id,
                updated_at = now()
            WHERE o.org_id = v_org
              AND o.customer_id = ANY (v_affected_customer_ids)
              AND (
                  o.primary_person_id IS NULL
                  OR o.primary_person_id = ANY (v_remove_person_ids)
              );

            UPDATE public.customer_persons cp
            SET is_primary = false,
                updated_at = now()
            WHERE cp.org_id = v_org
              AND cp.customer_id = ANY (v_affected_customer_ids)
              AND cp.role_type = 'primary_contact'
              AND cp.person_id IS DISTINCT FROM v_kevin_id;

            UPDATE public.customer_persons cp
            SET is_primary = true,
                role_type = 'primary_contact',
                updated_at = now()
            WHERE cp.org_id = v_org
              AND cp.customer_id = ANY (v_affected_customer_ids)
              AND cp.person_id = v_kevin_id;

            INSERT INTO public.customer_persons (org_id, customer_id, person_id, role_type, is_primary, metadata)
            SELECT
                v_org,
                cid,
                v_kevin_id,
                'primary_contact',
                true,
                jsonb_build_object('seed_source', 'migration_20260602150000_demo_kurzman_cleanup')
            FROM unnest(v_affected_customer_ids) AS cid
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.customer_persons cp
                WHERE cp.org_id = v_org
                  AND cp.customer_id = cid
                  AND cp.person_id = v_kevin_id
                  AND cp.role_type = 'primary_contact'
            );
        ELSE
            UPDATE public.opportunities o
            SET primary_person_id = NULL,
                updated_at = now()
            WHERE o.org_id = v_org
              AND o.primary_person_id = ANY (v_remove_person_ids);
        END IF;

        DELETE FROM public.customer_persons cp
        WHERE cp.org_id = v_org
          AND cp.person_id = ANY (v_remove_person_ids);

        DELETE FROM public.customer_members cm
        WHERE cm.org_id = v_org
          AND cm.id = ANY (v_remove_member_ids);

        DELETE FROM public.field_values fv
        USING public.field_definitions fd
        WHERE fv.field_definition_id = fd.id
          AND fv.org_id = v_org
          AND fv.entity_type = 'person'
          AND fv.entity_id = ANY (v_remove_person_ids);

        -- vendors.primary_person_id has no ON DELETE action (Kelly may be vendor identity in staging).
        UPDATE public.vendors v
        SET primary_person_id = NULL,
            updated_at = now()
        WHERE v.org_id = v_org
          AND v.primary_person_id = ANY (v_remove_person_ids);

        DELETE FROM public.communication_scheduled_sends css
        WHERE css.org_id = v_org
          AND css.recipient_person_id = ANY (v_remove_person_ids);

        DELETE FROM public.persons p
        WHERE p.org_id = v_org
          AND p.id = ANY (v_remove_person_ids);

        RAISE NOTICE 'demo_kurzman_cleanup: removed % persons, % members; kevin=%; customers=%',
            cardinality(v_remove_person_ids),
            cardinality(v_remove_member_ids),
            v_kevin_id,
            cardinality(v_affected_customer_ids);
    END IF;
END $$;

-- person_gender option set: Male, Female, Not Specified (all orgs).
DELETE FROM public.option_set_items osi
USING public.option_sets os
WHERE osi.option_set_id = os.id
  AND os.set_key = 'person_gender'
  AND osi.item_key IN ('non_binary', 'prefer_not_to_say');

INSERT INTO public.option_set_items (option_set_id, item_key, label, sort_order, metadata)
SELECT os.id, v.item_key, v.label, v.sort_order, '{}'::jsonb
FROM public.option_sets os
CROSS JOIN (
    VALUES
        ('male', 'Male', 10),
        ('female', 'Female', 20),
        ('not_specified', 'Not Specified', 30)
) AS v(item_key, label, sort_order)
WHERE os.set_key = 'person_gender'
ON CONFLICT (option_set_id, item_key) DO UPDATE SET
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

UPDATE public.field_values fv
SET value_text = 'not_specified',
    updated_at = now()
FROM public.field_definitions fd
WHERE fv.field_definition_id = fd.id
  AND fd.entity_type = 'person'
  AND fd.field_key = 'gender'
  AND fv.value_text IN ('non_binary', 'prefer_not_to_say');
