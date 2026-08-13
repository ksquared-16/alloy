import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { ADMIN_FIELD_TYPES } from "@/lib/fields/adminFieldTypeList";
import { validateSelectLikeConfig } from "@/lib/fields/fieldDefinitionConfig";
import { mergeFieldDefinitionPoliciesFromBody } from "@/lib/fields/fieldDefinitionPolicyWrite";
import {
    FIELD_DEFINITION_ENTITY_TYPES,
    isFieldDefinitionEntityType,
    isReservedInquiryChildFieldKey,
} from "@/lib/fields/inquiryChildFieldRegistry";
import { isReservedCustomerMemberFieldKey } from "@/lib/fields/customerMemberFieldRegistry";
import {
    EMPLOYMENT_ENTITY_TYPE,
    isReservedEmploymentFieldKey,
} from "@/lib/employment/employmentFieldRegistry";

const ALLOWED_ENTITY_TYPES = FIELD_DEFINITION_ENTITY_TYPES;

export type FieldDef = {
    id: string;
    org_id: string;
    entity_type: string;
    field_key: string;
    field_type: string;
    label: string | null;
    description: string | null;
    is_system: boolean;
    is_required: boolean;
    is_active: boolean;
    is_visible_in_form: boolean;
    is_visible_in_drawer: boolean;
    is_visible_in_table: boolean;
    is_filterable: boolean;
    is_sortable: boolean;
    section_key: string | null;
    sort_order: number;
    placeholder: string | null;
    help_text: string | null;
    config: Record<string, unknown> | null;
    is_visible_in_public_booking: boolean;
    requirement_policy?: unknown | null;
    interaction_policy?: unknown | null;
    created_at: string;
    updated_at: string;
};

/** GET: list field_definitions for current org and entity_type. Ordered by section_key, sort_order. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type")?.trim() || null;

    if (!entityType || !isFieldDefinitionEntityType(entityType)) {
        return NextResponse.json(
            { error: `entity_type is required and must be one of: ${ALLOWED_ENTITY_TYPES.join(", ")}` },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("field_definitions")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entityType)
        .order("section_key", { ascending: true })
        .order("sort_order", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ field_definitions: rows ?? [] });
}

const FIELD_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

/** POST: create a custom field definition. entity_type must be one of allowed types, is_system=false. Admin only. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim() : "";
    if (!isFieldDefinitionEntityType(entity_type)) {
        return NextResponse.json(
            { error: `entity_type must be one of: ${ALLOWED_ENTITY_TYPES.join(", ")}` },
            { status: 400 }
        );
    }

    let field_key = typeof body.field_key === "string" ? body.field_key.trim().toLowerCase().replace(/\s+/g, "_") : "";
    if (!FIELD_KEY_REGEX.test(field_key)) {
        return NextResponse.json(
            { error: "field_key must be 2–64 characters, lowercase letters, numbers, and underscores only" },
            { status: 400 }
        );
    }

    if (entity_type === "inquiry_child" && isReservedInquiryChildFieldKey(field_key)) {
        return NextResponse.json(
            { error: `field_key '${field_key}' is reserved for a native inquiry child field` },
            { status: 400 }
        );
    }

    if (entity_type === "customer_member" && isReservedCustomerMemberFieldKey(field_key)) {
        return NextResponse.json(
            { error: `field_key '${field_key}' is reserved for a native or system customer member field` },
            { status: 400 }
        );
    }

    if (entity_type === EMPLOYMENT_ENTITY_TYPE && isReservedEmploymentFieldKey(field_key)) {
        return NextResponse.json(
            { error: `field_key '${field_key}' is reserved for a native employment field` },
            { status: 400 }
        );
    }

    const field_type = typeof body.field_type === "string" ? body.field_type.trim().toLowerCase() : "text";
    if (!ADMIN_FIELD_TYPES.includes(field_type as (typeof ADMIN_FIELD_TYPES)[number])) {
        return NextResponse.json(
            { error: `field_type must be one of: ${ADMIN_FIELD_TYPES.join(", ")}` },
            { status: 400 }
        );
    }

    const label = typeof body.label === "string" ? body.label.trim() || field_key : field_key;
    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const section_key = typeof body.section_key === "string" ? body.section_key.trim() || "custom" : "custom";
    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 100;
    const is_required = !!body.is_required;
    const is_active = body.is_active !== false;
    const is_visible_in_form = body.is_visible_in_form !== false;
    const is_visible_in_drawer = body.is_visible_in_drawer !== false;
    const is_visible_in_table = body.is_visible_in_table !== false;
    const is_filterable = !!body.is_filterable;
    const is_sortable = !!body.is_sortable;
    const placeholder = typeof body.placeholder === "string" ? body.placeholder.trim() || null : null;
    const help_text = typeof body.help_text === "string" ? body.help_text.trim() || null : null;
    const config: Record<string, unknown> =
        body.config != null && typeof body.config === "object" ? (body.config as Record<string, unknown>) : {};

    const cfgCheck = validateSelectLikeConfig(field_type, config);
    if (!cfgCheck.ok) {
        return NextResponse.json({ error: cfgCheck.error }, { status: 400 });
    }

    const is_visible_in_public_booking = !!body.is_visible_in_public_booking;

    const policyMerge = mergeFieldDefinitionPoliciesFromBody({
        is_required,
        requirement_policy: body.requirement_policy,
        interaction_policy: body.interaction_policy,
    });
    if (!policyMerge.ok) {
        return NextResponse.json({ error: policyMerge.error }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existing } = await supabase
        .from("field_definitions")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entity_type)
        .eq("field_key", field_key)
        .limit(1)
        .maybeSingle();

    if (existing) {
        return NextResponse.json(
            { error: `field_key '${field_key}' already exists for this org and entity type` },
            { status: 409 }
        );
    }

    const insert: Record<string, unknown> = {
        org_id: ctx.orgId,
        entity_type,
        field_key,
        field_type,
        label,
        description,
        section_key,
        sort_order,
        is_system: false,
        is_required,
        is_active,
        is_visible_in_form,
        is_visible_in_drawer,
        is_visible_in_table,
        is_filterable,
        is_sortable,
        placeholder,
        help_text,
        config,
        is_visible_in_public_booking,
        ...(policyMerge.requirement_policy !== undefined
            ? {
                  requirement_policy: policyMerge.requirement_policy,
                  is_required: policyMerge.is_required,
              }
            : {}),
        ...(policyMerge.interaction_policy !== undefined
            ? { interaction_policy: policyMerge.interaction_policy }
            : {}),
    };

    const { data: created, error } = await supabase
        .from("field_definitions")
        .insert(insert)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(created, { status: 201 });
}
