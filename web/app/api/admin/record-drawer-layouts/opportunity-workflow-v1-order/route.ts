import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import {
    listOpportunityWorkflowV1CanonicalSectionKeys,
    type PreviewFieldDef,
} from "@/lib/recordChrome/effectiveDrawerLayoutPreview";
import {
    mergeOpportunityWorkflowV1OrderIntoConfigJson,
    validateOpportunityWorkflowV1SectionOrder,
} from "@/lib/admin/opportunityWorkflowV1DrawerOrder";
import { assertLegacyOpportunityLayoutWriteAllowed } from "@/lib/admin/legacyOpportunityLayoutWriteGuard";

/**
 * PATCH: persist safe workflow v1 opportunity drawer section order into `record_drawer_layouts.config_json`
 * (or create org override from effective global template when none exists).
 *
 * Body: `{ overview_section_order: string[] }` — exact permutation of canonical resolved section keys.
 */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    const writeGuard = assertLegacyOpportunityLayoutWriteAllowed();
    if (!writeGuard.ok) return writeGuard.response;

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const orderRaw = (body as { overview_section_order?: unknown }).overview_section_order;
    if (!Array.isArray(orderRaw) || !orderRaw.every((x) => typeof x === "string")) {
        return NextResponse.json({ error: "overview_section_order must be an array of strings" }, { status: 400 });
    }
    const overview_section_order = orderRaw.map((s) => s.trim()).filter(Boolean);

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
            { error: "Safe ordering edits apply only when inquiry_drawer_mode is workflow_v1" },
            { status: 400 }
        );
    }

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
    const fieldDefinitions = (fds ?? []) as PreviewFieldDef[];

    const { data: secs, error: secErr } = await supabase
        .from("field_section_definitions")
        .select("section_key, label")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", "opportunity");

    if (secErr) {
        return NextResponse.json({ error: secErr.message }, { status: 500 });
    }
    const fieldSectionLabels: Record<string, string> = {};
    for (const r of secs ?? []) {
        const sk = String((r as { section_key?: string }).section_key ?? "").trim();
        if (sk) fieldSectionLabels[sk] = String((r as { label?: string }).label ?? "").trim();
    }

    const canonicalKeys = listOpportunityWorkflowV1CanonicalSectionKeys(baseCfg, fieldDefinitions, fieldSectionLabels, {
        proposedOrder: overview_section_order,
    });
    const validated = validateOpportunityWorkflowV1SectionOrder(overview_section_order, canonicalKeys);
    if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const nextConfig = mergeOpportunityWorkflowV1OrderIntoConfigJson(baseCfg, overview_section_order);
    const now = new Date().toISOString();

    if (resolved.layout.source === "org_drawer_override" && resolved.layout.record_drawer_layout_id) {
        const { error: upErr } = await supabase
            .from("record_drawer_layouts")
            .update({ config_json: nextConfig as Record<string, unknown>, updated_at: now })
            .eq("id", resolved.layout.record_drawer_layout_id)
            .eq("org_id", ctx.orgId);

        if (upErr) {
            return NextResponse.json({ error: upErr.message }, { status: 500 });
        }
    } else {
        const { error: insErr } = await supabase.from("record_drawer_layouts").insert({
            org_id: ctx.orgId,
            entity_type: "opportunity",
            surface: "drawer",
            key: "default",
            config_json: nextConfig as Record<string, unknown>,
            is_active: true,
            updated_at: now,
        });

        if (insErr) {
            return NextResponse.json({ error: insErr.message }, { status: 500 });
        }
    }

    return NextResponse.json({
        ok: true,
        overview_section_order,
        created_org_override: resolved.layout.source !== "org_drawer_override",
    });
}
