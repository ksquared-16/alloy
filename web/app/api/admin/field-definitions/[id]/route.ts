import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { validateSelectLikeConfig } from "@/lib/fields/fieldDefinitionConfig";
import { mergeFieldDefinitionPoliciesFromBody } from "@/lib/fields/fieldDefinitionPolicyWrite";
import { resolveDrawerFieldPolicy } from "@/lib/fields/drawerFieldPolicyAdapter";

const ALLOWED_PATCH_KEYS = [
    "label",
    "description",
    "is_required",
    "requirement_policy",
    "interaction_policy",
    "is_active",
    "is_visible_in_form",
    "is_visible_in_drawer",
    "is_visible_in_table",
    "is_filterable",
    "is_sortable",
    "section_key",
    "sort_order",
    "placeholder",
    "help_text",
    "config",
    "is_visible_in_public_booking",
] as const;

const FORBIDDEN_FOR_SYSTEM = ["org_id", "entity_type", "field_key", "field_type", "is_system"] as const;

/** GET: single field_definition for current org (admin/ops). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("field_definitions")
        .select("*")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
        return NextResponse.json({ error: "Field definition not found" }, { status: 404 });
    }

    return NextResponse.json(row);
}

/** PATCH: update field_definition. For is_system=true, org_id, entity_type, field_key, field_type, is_system are immutable. Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
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

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("field_definitions")
        .select("id, org_id, entity_type, field_key, is_system, field_type, config, is_required, requirement_policy, interaction_policy")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Field definition not found" }, { status: 404 });
    }

    const is_system = Boolean((existing as { is_system: boolean }).is_system);
    if (is_system) {
        for (const key of FORBIDDEN_FOR_SYSTEM) {
            if (body[key] !== undefined) {
                return NextResponse.json(
                    { error: `Cannot change ${key} on a system field` },
                    { status: 400 }
                );
            }
        }
    }

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_PATCH_KEYS) {
        if (body[key] === undefined) continue;
        if (key === "label") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() : "";
            continue;
        }
        if (key === "description" || key === "placeholder" || key === "help_text") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() || null : null;
            continue;
        }
        if (key === "section_key") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() : "";
            continue;
        }
        if (key === "sort_order") {
            const v = body[key];
            updates[key] = typeof v === "number" && !Number.isNaN(v) ? v : Number(v);
            continue;
        }
        if (
            key === "is_required" ||
            key === "is_active" ||
            key === "is_visible_in_form" ||
            key === "is_visible_in_drawer" ||
            key === "is_visible_in_table" ||
            key === "is_filterable" ||
            key === "is_sortable" ||
            key === "is_visible_in_public_booking"
        ) {
            updates[key] = !!body[key];
            continue;
        }
        if (key === "config") {
            updates[key] = body[key] != null && typeof body[key] === "object" ? (body[key] as Record<string, unknown>) : {};
            continue;
        }
    }

    if (updates.config !== undefined) {
        const ft = String((existing as { field_type?: string }).field_type ?? "text");
        const existingConfig =
            (existing as { config?: Record<string, unknown> | null }).config != null
            && typeof (existing as { config?: Record<string, unknown> | null }).config === "object"
            && !Array.isArray((existing as { config?: Record<string, unknown> | null }).config)
                ? ((existing as { config: Record<string, unknown> }).config)
                : {};
        const mergedConfig = {
            ...existingConfig,
            ...(updates.config as Record<string, unknown>),
        };
        const cfgCheck = validateSelectLikeConfig(ft, mergedConfig);
        if (!cfgCheck.ok) {
            return NextResponse.json({ error: cfgCheck.error }, { status: 400 });
        }
    }

    const existingEntityType = String((existing as { entity_type?: string }).entity_type ?? "");
    const existingFieldKey = String((existing as { field_key?: string }).field_key ?? "");
    const existingIsSystem = Boolean((existing as { is_system?: boolean }).is_system);
    const policyWriteRequested =
        body.is_required !== undefined ||
        body.requirement_policy !== undefined ||
        body.interaction_policy !== undefined;

    if (policyWriteRequested) {
        const et = existingEntityType.trim().toLowerCase();
        if (et === "opportunity" || et === "job") {
            const resolved = resolveDrawerFieldPolicy(et, {
                field_key: existingFieldKey,
                is_system: existingIsSystem,
            });
            if (!resolved || resolved.policyMode !== "enforceable") {
                return NextResponse.json(
                    {
                        error: `Field policy cannot be edited for this field: ${resolved?.reason ?? "not mapped for drawer enforcement"}`,
                    },
                    { status: 400 }
                );
            }
        }
    }

    const policyMerge = mergeFieldDefinitionPoliciesFromBody(
        {
            is_required: body.is_required as boolean | undefined,
            requirement_policy: body.requirement_policy,
            interaction_policy: body.interaction_policy,
        },
        { existing_is_required: Boolean((existing as { is_required?: boolean }).is_required) }
    );
    if (!policyMerge.ok) {
        return NextResponse.json({ error: policyMerge.error }, { status: 400 });
    }
    if (policyMerge.requirement_policy !== undefined) {
        updates.requirement_policy = policyMerge.requirement_policy;
        updates.is_required = policyMerge.is_required;
    }
    if (policyMerge.interaction_policy !== undefined) {
        updates.interaction_policy = policyMerge.interaction_policy;
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
        .from("field_definitions")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }
    if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logAdminAudit({
        entity: "field_definitions",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(updated);
}

/** DELETE: remove a custom field definition (cascades field_values). System rows are protected. Admin only. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("field_definitions")
        .select("id, org_id, is_system, field_key")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Field definition not found" }, { status: 404 });
    }

    if (Boolean((existing as { is_system: boolean }).is_system)) {
        return NextResponse.json({ error: "Cannot delete a system field definition" }, { status: 400 });
    }

    const { error: delErr } = await supabase.from("field_definitions").delete().eq("id", id).eq("org_id", ctx.orgId);

    if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    logAdminAudit({
        entity: "field_definitions",
        id,
        changed_fields: ["deleted"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ ok: true });
}
