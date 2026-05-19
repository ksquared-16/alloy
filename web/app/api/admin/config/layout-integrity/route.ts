import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import { validateLayoutIntegrityNow } from "@/lib/config/layoutIntegrityValidator";
import type { LayoutIntegrityFieldInput } from "@/lib/config/layoutIntegrityValidator";
import { FIELD_DEFINITION_ENTITY_TYPES, isFieldDefinitionEntityType } from "@/lib/fields/inquiryChildFieldRegistry";

const ALLOWED_ENTITY_TYPES = FIELD_DEFINITION_ENTITY_TYPES;

/**
 * GET — read-only layout integrity report for an entity type (Card 4 admin visibility).
 * Query: entity_type (required)
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const entityType = request.nextUrl.searchParams.get("entity_type")?.trim() || "";
    if (!entityType || !isFieldDefinitionEntityType(entityType)) {
        return NextResponse.json(
            { error: `entity_type required; one of: ${ALLOWED_ENTITY_TYPES.join(", ")}` },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();

    const { data: fieldRows, error: fieldErr } = await supabase
        .from("field_definitions")
        .select(
            "field_key, entity_type, field_type, is_active, is_system, is_required, requirement_policy, interaction_policy, is_visible_in_form, is_visible_in_drawer, is_visible_in_table, is_visible_in_public_booking, section_key, config"
        )
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entityType);

    if (fieldErr) {
        return NextResponse.json({ error: fieldErr.message }, { status: 500 });
    }

    const { data: sectionRows, error: sectionErr } = await supabase
        .from("field_section_definitions")
        .select("section_key, entity_type, is_archived, section_config")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entityType);

    if (sectionErr) {
        return NextResponse.json({ error: sectionErr.message }, { status: 500 });
    }

    const layoutResolved = await fetchEffectiveRecordDrawerLayout(supabase, ctx.orgId, entityType);
    const layout_config_json = layoutResolved.ok && layoutResolved.layout ? layoutResolved.layout.config_json : null;
    const layout_id =
        layoutResolved.ok && layoutResolved.layout
            ? layoutResolved.layout.source === "org_drawer_override"
                ? layoutResolved.layout.record_drawer_layout_id
                : layoutResolved.layout.record_layout_id
            : null;

    const optionSetKeys = new Set<string>();
    for (const row of fieldRows ?? []) {
        const cfg = row.config as Record<string, unknown> | null;
        const key =
            cfg && typeof cfg === "object" && typeof cfg.option_set_key === "string"
                ? cfg.option_set_key.trim()
                : "";
        if (key) optionSetKeys.add(key);
    }

    const option_sets: { set_key: string; active_item_count: number }[] = [];
    if (optionSetKeys.size > 0) {
        const { data: sets } = await supabase
            .from("option_sets")
            .select("id, key")
            .eq("org_id", ctx.orgId)
            .in("key", [...optionSetKeys]);

        for (const s of sets ?? []) {
            const { count } = await supabase
                .from("option_set_items")
                .select("id", { count: "exact", head: true })
                .eq("option_set_id", s.id)
                .eq("is_active", true);
            option_sets.push({ set_key: String(s.key), active_item_count: count ?? 0 });
        }
    }

    const field_definitions: LayoutIntegrityFieldInput[] = (fieldRows ?? []).map((r) => ({
        field_key: String(r.field_key),
        entity_type: String(r.entity_type),
        field_type: String(r.field_type),
        is_active: r.is_active !== false,
        is_system: Boolean(r.is_system),
        is_required: Boolean(r.is_required),
        requirement_policy: r.requirement_policy,
        interaction_policy: r.interaction_policy,
        is_visible_in_form: r.is_visible_in_form !== false,
        is_visible_in_drawer: r.is_visible_in_drawer !== false,
        is_visible_in_table: Boolean(r.is_visible_in_table),
        is_visible_in_public_booking: Boolean(r.is_visible_in_public_booking),
        section_key: r.section_key,
        config: r.config,
    }));

    const report = validateLayoutIntegrityNow({
        entity_type: entityType,
        field_definitions,
        sections: (sectionRows ?? []).map((s) => ({
            section_key: String(s.section_key),
            entity_type: String(s.entity_type),
            is_archived: Boolean(s.is_archived),
            section_config: s.section_config,
        })),
        layout_config_json,
        option_sets,
        layout_id: layout_id ?? undefined,
    });

    return NextResponse.json({ report });
}
