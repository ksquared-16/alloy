import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { adminActionsOrgTag } from "@/lib/admin/actions/cacheTags";
import {
    ActionPlacementValidationError,
    validateActionPlacementCreate,
} from "@/lib/admin/actions/actionPlacementMutation";

/** POST — create org-scoped placement for an existing action definition. Admin only. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    let input;
    try {
        input = validateActionPlacementCreate(body);
    } catch (e) {
        if (e instanceof ActionPlacementValidationError) {
            return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
    }

    const supabase = createAdminClient();
    const { data: def, error: defErr } = await supabase
        .from("action_definitions")
        .select("id, org_id, key, entity_type, is_active")
        .eq("id", input.action_definition_id)
        .maybeSingle();

    if (defErr) return NextResponse.json({ error: defErr.message }, { status: 500 });
    if (!def) return NextResponse.json({ error: "Action definition not found" }, { status: 404 });

    const defOrgId = (def as { org_id?: string | null }).org_id ?? null;
    if (defOrgId != null && defOrgId !== ctx.orgId) {
        return NextResponse.json({ error: "Action definition belongs to another organization" }, { status: 403 });
    }
    if (!(def as { is_active?: boolean }).is_active) {
        return NextResponse.json({ error: "Action definition is not active" }, { status: 400 });
    }

    const entityType = input.entity_type ?? ((def as { entity_type?: string | null }).entity_type ?? null);

    const { data: dup } = await supabase
        .from("action_placements")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("action_definition_id", input.action_definition_id)
        .eq("surface", input.surface)
        .eq("slot", input.slot)
        .eq("entity_type", entityType)
        .eq("section_key", input.section_key ?? null)
        .maybeSingle();

    if (dup) {
        return NextResponse.json({ error: "A matching placement already exists for this organization" }, { status: 409 });
    }

    const { data: inserted, error: insErr } = await supabase
        .from("action_placements")
        .insert({
            org_id: ctx.orgId,
            action_definition_id: input.action_definition_id,
            surface: input.surface,
            slot: input.slot,
            entity_type: entityType,
            section_key: input.section_key ?? null,
            order_index: input.order_index ?? 100,
            display_style: input.display_style ?? "button",
            condition_config: {},
            is_active: true,
        })
        .select(
            "id, org_id, action_definition_id, surface, slot, entity_type, section_key, order_index, display_style, is_active"
        )
        .maybeSingle();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    try {
        revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
    } catch {
        /* non-fatal */
    }

    return NextResponse.json({ placement: inserted }, { status: 201 });
}
