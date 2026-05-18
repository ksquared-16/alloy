import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import {
    buildEffectiveDrawerLayoutPreview,
    buildOpportunityWorkflowV1EditorSections,
    type PreviewFieldDef,
} from "@/lib/recordChrome/effectiveDrawerLayoutPreview";
import type { EntityPresentationType } from "@/lib/entityPresentation";

const ALLOWED = new Set(["job", "schedule", "opportunity"]);

function presentationEntityForLayoutEntity(entityType: string): EntityPresentationType | null {
    switch (entityType) {
        case "opportunity":
            return "opportunities";
        case "job":
            return "jobs";
        case "schedule":
            return "schedules";
        default:
            return null;
    }
}

/**
 * GET: read-only effective drawer layout preview for Settings (Card 8).
 * Uses the same DB resolution as `GET /api/admin/record-layouts`, then builds section ordering
 * consistent with `AdminEntityDrawer` for opportunities; skeleton ordering for job/schedule.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const entityType = (request.nextUrl.searchParams.get("entity_type") ?? "").trim().toLowerCase();
    if (!entityType || !ALLOWED.has(entityType)) {
        return NextResponse.json({ error: "entity_type must be job, schedule, or opportunity" }, { status: 400 });
    }

    const presentationEntityType = presentationEntityForLayoutEntity(entityType);
    if (!presentationEntityType) {
        return NextResponse.json({ error: "Unsupported entity_type" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const resolved = await fetchEffectiveRecordDrawerLayout(supabase, ctx.orgId, entityType);
    if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 500 });
    }

    const layout = resolved.layout;
    if (!layout) {
        return NextResponse.json({
            entity_type: entityType,
            surface: "drawer",
            layout_resolution: {
                source: "global_template",
                record_drawer_layout_id: null,
                record_layout_id: null,
                layout_key: "default",
                global_template_count: 0,
            },
            workflow: {
                inquiry_drawer_mode: null,
                workflow_v1_configured: false,
                workflow_v1_body_transform_active: false,
            },
            preview_fidelity: "presentation_ordered_skeleton",
            sections: [],
            empty_reason: "No active drawer layout row (no org override and no global record_layouts template).",
        });
    }

    const cfg = layout.config_json;

    let fieldDefinitions: PreviewFieldDef[] = [];
    let fieldSectionLabels: Record<string, string> = {};

    /** Full mirror uses org field catalog + section labels; job/schedule skeleton skips these queries for now. */
    if (entityType === "opportunity") {
        const { data: fds, error: fdErr } = await supabase
            .from("field_definitions")
            .select("field_key, field_type, label, section_key, sort_order, is_visible_in_drawer")
            .eq("org_id", ctx.orgId)
            .eq("entity_type", "opportunity")
            .order("section_key", { ascending: true })
            .order("sort_order", { ascending: true });

        if (fdErr) {
            return NextResponse.json({ error: fdErr.message }, { status: 500 });
        }
        fieldDefinitions = (fds ?? []) as PreviewFieldDef[];

        const { data: secs, error: secErr } = await supabase
            .from("field_section_definitions")
            .select("section_key, label")
            .eq("org_id", ctx.orgId)
            .eq("entity_type", "opportunity");

        if (secErr) {
            return NextResponse.json({ error: secErr.message }, { status: 500 });
        }
        const labels: Record<string, string> = {};
        for (const r of secs ?? []) {
            const sk = String((r as { section_key?: string }).section_key ?? "").trim();
            const lb = String((r as { label?: string }).label ?? "").trim();
            if (sk && lb) labels[sk] = lb;
        }
        fieldSectionLabels = labels;
    }

    const preview = buildEffectiveDrawerLayoutPreview({
        presentationEntityType,
        config: cfg,
        fieldDefinitions,
        fieldSectionLabels,
    });

    const inquiryMode = cfg.inquiry_drawer_mode ?? null;
    const workflowV1Configured = inquiryMode === "workflow_v1";

    const editor_sections =
        workflowV1Configured && entityType === "opportunity"
            ? buildOpportunityWorkflowV1EditorSections(cfg, fieldDefinitions, fieldSectionLabels)
            : undefined;

    return NextResponse.json({
        entity_type: entityType,
        surface: "drawer",
        layout_resolution: {
            source: layout.source,
            record_drawer_layout_id: layout.record_drawer_layout_id,
            record_layout_id: layout.record_layout_id,
            layout_key: layout.key,
            global_template_count: layout.global_template_count,
        },
        workflow: {
            inquiry_drawer_mode: inquiryMode,
            /** True when opportunity layout opts into inquiry workflow v1 chrome (virtual sections + tuition placeholder). */
            workflow_v1_configured: workflowV1Configured,
            /** Same flag for preview: transforms apply whenever workflow_v1 is configured (matches drawer config gate). */
            workflow_v1_body_transform_active: workflowV1Configured && entityType === "opportunity",
        },
        preview_fidelity: preview.fidelity,
        sections: preview.sections,
        editor_sections,
        overview_hidden_sections: cfg.overview_hidden_sections ?? [],
    });
}
