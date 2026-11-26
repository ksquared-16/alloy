-- Certification fix: customer_persons unique key includes role_type (uq_customer_persons_unique).
-- Align execute_processing_identity_group ON CONFLICT with live schema.

CREATE OR REPLACE FUNCTION public.execute_processing_identity_group(
    p_org_id uuid,
    p_actor text,
    p_idempotency_key text,
    p_operations jsonb
)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
    v_refs   jsonb := '{}'::jsonb;
    v_op     jsonb;
    v_op_id  text;
    v_key    text;
    v_pl     jsonb;
    v_new_id uuid;
    v_person uuid;
    v_house  uuid;
    v_role   text;
BEGIN
    FOR v_op IN SELECT * FROM jsonb_array_elements(p_operations)
    LOOP
        v_op_id := v_op ->> 'op_id';
        v_key   := v_op ->> 'command_key';
        v_pl    := v_op -> 'payload';

        IF v_key = 'create_person' THEN
            INSERT INTO persons (org_id, first_name, last_name, email, phone)
            VALUES (
                p_org_id,
                v_pl ->> 'first_name',
                v_pl ->> 'last_name',
                v_pl ->> 'email',
                v_pl ->> 'phone'
            )
            RETURNING id INTO v_new_id;

        ELSIF v_key = 'create_household' THEN
            INSERT INTO customers (org_id, name)
            VALUES (p_org_id, coalesce(v_pl ->> 'household_name', 'Household'))
            RETURNING id INTO v_new_id;

        ELSIF v_key = 'link_person_to_household' THEN
            v_person := public.processing_resolve_ref(v_pl ->> 'person_id', v_refs)::uuid;
            v_house  := public.processing_resolve_ref(v_pl ->> 'household_id', v_refs)::uuid;
            v_role   := coalesce(v_pl ->> 'role_type', 'primary_contact');
            INSERT INTO customer_persons (org_id, customer_id, person_id, role_type)
            VALUES (p_org_id, v_house, v_person, v_role)
            ON CONFLICT (org_id, customer_id, person_id, role_type) DO UPDATE SET role_type = EXCLUDED.role_type
            RETURNING id INTO v_new_id;

        ELSIF v_key IN ('create_child', 'link_child_to_household') THEN
            v_house := public.processing_resolve_ref(v_pl ->> 'household_id', v_refs)::uuid;
            INSERT INTO customer_members (
                org_id, customer_id, person_id, display_name, first_name, last_name, dob, relationship
            )
            VALUES (
                p_org_id,
                v_house,
                NULLIF(public.processing_resolve_ref(v_pl ->> 'person_id', v_refs), '')::uuid,
                coalesce(v_pl ->> 'display_name', 'Child'),
                v_pl ->> 'first_name',
                v_pl ->> 'last_name',
                NULLIF(v_pl ->> 'dob', '')::date,
                coalesce(v_pl ->> 'relationship', 'child')
            )
            RETURNING id INTO v_new_id;

        ELSE
            RAISE EXCEPTION 'unsupported_atomic_group_command:%', v_key;
        END IF;

        v_refs := jsonb_set(v_refs, ARRAY[v_op_id], to_jsonb(v_new_id::text));
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'refs', v_refs);
END;
$$;
