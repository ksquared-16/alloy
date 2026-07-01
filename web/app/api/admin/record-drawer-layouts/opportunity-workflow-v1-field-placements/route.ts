import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import {
    mergeOpportunityWorkflowV1FieldPlacementUpdates,
    type FieldPlacementBehaviorUpdate,
} from "@/lib/admin/opportunityWorkflowV1FieldPlacements";
import { persistOpportunityDrawerLayoutConfig } from "@/lib/admin/recordDrawerLayoutPersist";

/**
 * PATCH: opportunity workflow v1 drawer field placement behavior (required / editability).
 * Writes `config_json.field_placements_v1` only — does not mutate field_definitions.
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
        return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updatesRaw = (body as { updates?: unknown }).updates;
    if (!Array.isArray(updatesRaw)) {
        return NextResponse.json({ error: "updates must be an array" }, { status: 400 });
    }

    const updates: FieldPlacementBehaviorUpdate[] = updatesRaw.map((row) => {
        const r = row as {
            field_key?: unknown;
            requirement_preset?: unknown;
            interaction_preset?: unknown;
        };
        const out: FieldPlacementBehaviorUpdate = {
            field_key: String(r.field_key ?? "").trim(),
        };
        if (r.requirement_preset !== undefined) {
            out.requirement_preset = String(r.requirement_preset).trim() as FieldPlacementBehaviorUpdate["requirement_preset"];
        }
        if (r.interaction_preset !== undefined) {
            out.interaction_preset = String(r.interaction_preset).trim() as FieldPlacementBehaviorUpdate["interaction_preset"];
        }
        return out;
    });

    const supabase = createAdminClient();
    const resolved = await fetchEffectiveRecordDrawerLayout(supabase, ctx.orgId, "opportunity");
    if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 500 });
    }
    if (!resolved.layout) {
        return NextResponse.json({ error: "No effective opportunity drawer layout to edit" }, { status: 400 });
    }

    const baseCfg = resolved.layout.config_json;
    if (baseCfg.inquiry_drawer_mode !== "workflow_v1") {
        return NextResponse.json(
            { error: "Field placement behavior applies only when inquiry_drawer_mode is workflow_v1" },
            { status: 400 }
        );
    }

    const { data: fds, error: fdErr } = await supabase
        .from("field_definitions")
        .select("field_key, is_system, is_active")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", "opportunity");

    if (fdErr) return NextResponse.json({ error: fdErr.message }, { status: 500 });

    const catalog = (fds ?? []).map((r) => ({
        field_key: String((r as { field_key: string }).field_key),
        is_system: Boolean((r as { is_system?: boolean }).is_system),
        is_active: (r as { is_active?: boolean }).is_active,
    }));

    const merged = mergeOpportunityWorkflowV1FieldPlacementUpdates(baseCfg, updates, catalog);
    if (!merged.ok) {
        return NextResponse.json({ error: merged.error }, { status: 400 });
    }

    const markerKeys = {
        overview_section_order: merged.config.overview_section_order,
        overview_hidden_sections: merged.config.overview_hidden_sections,
        inquiry_workflow_sections: merged.config.inquiry_workflow_sections,
        inquiry_drawer_mode: merged.config.inquiry_drawer_mode,
    };

    const saved = await persistOpportunityDrawerLayoutConfig(supabase, ctx.orgId, merged.config);
    if (!saved.ok) {
        return NextResponse.json({ error: saved.error }, { status: 500 });
    }

    const placementKeys = (merged.config.field_placements_v1 ?? []).map((p) => p.field_key);

    return NextResponse.json({
        ok: true,
        created_org_override: saved.created_org_override,
        field_placements_v1: merged.config.field_placements_v1,
        placement_field_keys: placementKeys,
        preserved_layout_keys: markerKeys,
    });
}
