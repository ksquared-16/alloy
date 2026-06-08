import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import {
    validateFieldPlacementBatch,
    type FieldDefPlacementRow,
    type FieldSectionCatalogRow,
} from "@/lib/fields/fieldPlacementBatch";
import { resolveLayoutCompositionCapabilities } from "@/lib/adminV2/layouts/layoutCompositionCapabilities";
import type { LayoutSettingsEntityKey } from "@/lib/adminV2/layoutsSettingsEntities";

const ALLOWED_ENTITY_TYPES = ["opportunity", "job", "schedule"] as const;

/**
 * PATCH: batch update field_definitions.section_key and/or sort_order only.
 * Validates against field_section_definitions (non-archived). Admin only.
 * No config_json mutation; no AI-only path.
 */
export async function PATCH(request: NextRequest) {
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

    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim().toLowerCase() : "";
    if (!ALLOWED_ENTITY_TYPES.includes(entity_type as (typeof ALLOWED_ENTITY_TYPES)[number])) {
        return NextResponse.json(
            { error: `entity_type must be one of: ${ALLOWED_ENTITY_TYPES.join(", ")}` },
            { status: 400 }
        );
    }

    const workflow_v1_configured = body.workflow_v1_configured === true;
    const caps = resolveLayoutCompositionCapabilities({
        entity: entity_type as LayoutSettingsEntityKey,
        workflowV1Configured: workflow_v1_configured,
    });
    if (!caps.canAssignFields || caps.isReadOnly) {
        return NextResponse.json(
            { error: caps.readOnlyReason ?? "Field placement is not editable for this record type" },
            { status: 403 }
        );
    }

    const updatesRaw = body.updates;
    if (!Array.isArray(updatesRaw)) {
        return NextResponse.json({ error: "updates must be an array" }, { status: 400 });
    }

    const updates = updatesRaw.map((row) => {
        const r = row as { id?: unknown; section_key?: unknown; sort_order?: unknown };
        return {
            id: String(r.id ?? "").trim(),
            section_key: r.section_key !== undefined ? String(r.section_key) : undefined,
            sort_order:
                r.sort_order !== undefined
                    ? typeof r.sort_order === "number"
                        ? r.sort_order
                        : Number(r.sort_order)
                    : undefined,
        };
    });

    const supabase = createAdminClient();

    const ids = updates.map((u) => u.id).filter(Boolean);
    const { data: fieldRows, error: fdErr } = await supabase
        .from("field_definitions")
        .select("id, entity_type, field_key, section_key, sort_order, is_system")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entity_type)
        .in("id", ids);

    if (fdErr) return NextResponse.json({ error: fdErr.message }, { status: 500 });
    if ((fieldRows ?? []).length !== ids.length) {
        return NextResponse.json({ error: "One or more field ids were not found for this org and entity_type" }, { status: 400 });
    }

    const { data: sections, error: secErr } = await supabase
        .from("field_section_definitions")
        .select("section_key, entity_type, is_archived")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entity_type);

    if (secErr) return NextResponse.json({ error: secErr.message }, { status: 500 });

    const validated = validateFieldPlacementBatch(
        { entity_type, updates },
        (fieldRows ?? []) as FieldDefPlacementRow[],
        (sections ?? []) as FieldSectionCatalogRow[]
    );
    if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const updatedRows: FieldDefPlacementRow[] = [];
    for (const patch of validated.normalized) {
        const { data: updated, error: updateErr } = await supabase
            .from("field_definitions")
            .update({ section_key: patch.section_key, sort_order: patch.sort_order })
            .eq("id", patch.id)
            .eq("org_id", ctx.orgId)
            .select("id, entity_type, field_key, section_key, sort_order")
            .single();

        if (updateErr || !updated) {
            return NextResponse.json(
                { error: updateErr?.message ?? `Failed to update field ${patch.id}` },
                { status: 400 }
            );
        }
        updatedRows.push(updated as FieldDefPlacementRow);
    }

    logAdminAudit({
        entity: "field_definitions",
        id: ids.join(","),
        changed_fields: ["batch_placement"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ ok: true, updated: updatedRows });
}
