import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { adminActionsOrgTag } from "@/lib/admin/actions/cacheTags";
import {
    ActionPlacementValidationError,
    actionPlacementEditableInSettings,
    validateActionPlacementPatch,
} from "@/lib/admin/actions/actionPlacementMutation";

/** PATCH org-scoped action placement (Settings V1). Admin only. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    const { id } = await context.params;
    const placementId = id.trim();
    if (!placementId) {
        return NextResponse.json({ error: "Missing placement id" }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    let patch;
    try {
        patch = validateActionPlacementPatch(body);
    } catch (e) {
        if (e instanceof ActionPlacementValidationError) {
            return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
    }

    const supabase = createAdminClient();
    const { data: existing, error: exErr } = await supabase
        .from("action_placements")
        .select("id, org_id, surface, section_key")
        .eq("id", placementId)
        .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rowOrgId = (existing as { org_id?: string | null }).org_id ?? null;
    if (!actionPlacementEditableInSettings(ctx.orgId, rowOrgId)) {
        return NextResponse.json({ error: "Platform-managed placements cannot be edited here" }, { status: 403 });
    }

    const nextSurface = patch.surface ?? String((existing as { surface?: string }).surface ?? "");
    if (nextSurface === "record_section" && patch.section_key === undefined) {
        const sk = (existing as { section_key?: string | null }).section_key;
        if (!sk) {
            return NextResponse.json({ error: "section_key is required for record_section placements" }, { status: 400 });
        }
    }
    if (patch.surface === "record_section" && (patch.section_key === null || patch.section_key === "")) {
        return NextResponse.json({ error: "section_key is required for record_section placements" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.is_active !== undefined) updates.is_active = patch.is_active;
    if (patch.order_index !== undefined) updates.order_index = patch.order_index;
    if (patch.surface !== undefined) updates.surface = patch.surface;
    if (patch.slot !== undefined) updates.slot = patch.slot;
    if (patch.section_key !== undefined) updates.section_key = patch.section_key;
    if (patch.display_style !== undefined) updates.display_style = patch.display_style;
    if (patch.entity_type !== undefined) updates.entity_type = patch.entity_type;

    const { data: updated, error: upErr } = await supabase
        .from("action_placements")
        .update(updates)
        .eq("id", placementId)
        .eq("org_id", ctx.orgId)
        .select(
            "id, org_id, action_definition_id, surface, slot, entity_type, section_key, order_index, display_style, is_active"
        )
        .maybeSingle();

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
        revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
    } catch {
        /* non-fatal */
    }

    return NextResponse.json({ placement: updated });
}

/** DELETE org-scoped placement (Settings — Remove button). Admin only. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    const { id } = await context.params;
    const placementId = id.trim();
    if (!placementId) {
        return NextResponse.json({ error: "Missing placement id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: exErr } = await supabase
        .from("action_placements")
        .select("id, org_id")
        .eq("id", placementId)
        .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rowOrgId = (existing as { org_id?: string | null }).org_id ?? null;
    if (!actionPlacementEditableInSettings(ctx.orgId, rowOrgId)) {
        return NextResponse.json(
            { error: "Built-in placements cannot be removed here — disable your org copy or contact support." },
            { status: 403 }
        );
    }

    const { error: delErr } = await supabase.from("action_placements").delete().eq("id", placementId).eq("org_id", ctx.orgId);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    try {
        revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
    } catch {
        /* non-fatal */
    }

    return NextResponse.json({ ok: true });
}
