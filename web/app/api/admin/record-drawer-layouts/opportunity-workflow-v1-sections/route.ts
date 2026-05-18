import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    listOpportunityWorkflowV1CanonicalSectionKeys,
    type PreviewFieldDef,
} from "@/lib/recordChrome/effectiveDrawerLayoutPreview";
import { validateOpportunityWorkflowV1SectionOrder } from "@/lib/admin/opportunityWorkflowV1DrawerOrder";
import { applyOpportunityWorkflowV1SectionPatches } from "@/lib/admin/opportunityWorkflowV1SectionConfig";
import { persistOpportunityDrawerLayoutConfig } from "@/lib/admin/recordDrawerLayoutPersist";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";

/**
 * PATCH: safe workflow v1 opportunity drawer section config (visibility, titles, order).
 *
 * Body (all optional, at least one required):
 * - overview_section_order: string[] — full permutation of canonical keys
 * - section_visibility: { section_key, visible }[]
 * - workflow_section_titles: { section_key, title }[]
 */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
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

    const b = body as {
        overview_section_order?: unknown;
        section_visibility?: unknown;
        workflow_section_titles?: unknown;
    };

    const hasOrder = Array.isArray(b.overview_section_order);
    const hasVis = Array.isArray(b.section_visibility);
    const hasTitles = Array.isArray(b.workflow_section_titles);
    if (!hasOrder && !hasVis && !hasTitles) {
        return NextResponse.json({ error: "No supported fields in body" }, { status: 400 });
    }

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
            { error: "Section configuration applies only when inquiry_drawer_mode is workflow_v1" },
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

    if (fdErr) return NextResponse.json({ error: fdErr.message }, { status: 500 });
    const fieldDefinitions = (fds ?? []) as PreviewFieldDef[];

    const { data: secs, error: secErr } = await supabase
        .from("field_section_definitions")
        .select("section_key, label")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", "opportunity");

    if (secErr) return NextResponse.json({ error: secErr.message }, { status: 500 });

    const fieldSectionLabels: Record<string, string> = {};
    for (const r of secs ?? []) {
        const sk = String((r as { section_key?: string }).section_key ?? "").trim();
        const lb = String((r as { label?: string }).label ?? "").trim();
        if (sk && lb) fieldSectionLabels[sk] = lb;
    }

    const canonicalKeys = listOpportunityWorkflowV1CanonicalSectionKeys(baseCfg, fieldDefinitions, fieldSectionLabels);

    let overview_section_order: string[] | undefined;
    if (hasOrder) {
        const orderRaw = b.overview_section_order;
        if (!Array.isArray(orderRaw) || !orderRaw.every((x) => typeof x === "string")) {
            return NextResponse.json({ error: "overview_section_order must be an array of strings" }, { status: 400 });
        }
        overview_section_order = orderRaw.map((s) => s.trim()).filter(Boolean);
        const validated = validateOpportunityWorkflowV1SectionOrder(overview_section_order, canonicalKeys);
        if (!validated.ok) {
            return NextResponse.json({ error: validated.error }, { status: 400 });
        }
    }

    const section_visibility = hasVis
        ? (b.section_visibility as unknown[]).map((row) => {
              const r = row as { section_key?: unknown; visible?: unknown };
              return { section_key: String(r.section_key ?? "").trim(), visible: Boolean(r.visible) };
          })
        : undefined;

    if (section_visibility?.some((p) => !p.section_key || !canonicalKeys.includes(p.section_key))) {
        return NextResponse.json({ error: "section_visibility contains unknown section_key" }, { status: 400 });
    }

    const workflow_section_titles = hasTitles
        ? (b.workflow_section_titles as unknown[]).map((row) => {
              const r = row as { section_key?: unknown; title?: unknown };
              return { section_key: String(r.section_key ?? "").trim(), title: String(r.title ?? "") };
          })
        : undefined;

    const patched = applyOpportunityWorkflowV1SectionPatches(baseCfg, {
        overview_section_order,
        section_visibility,
        workflow_section_titles,
    });
    if (!patched.ok) {
        return NextResponse.json({ error: patched.error }, { status: 400 });
    }

    const saved = await persistOpportunityDrawerLayoutConfig(supabase, ctx.orgId, patched.config);
    if (!saved.ok) {
        return NextResponse.json({ error: saved.error }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        created_org_override: saved.created_org_override,
        overview_hidden_sections: patched.config.overview_hidden_sections ?? [],
    });
}
