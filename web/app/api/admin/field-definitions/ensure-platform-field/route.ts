import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    findConfigurablePlacementFieldTemplate,
    listConfigurablePlacementFieldTemplatesForEntity,
} from "@/lib/fields/configurablePlacementFieldCatalog";

/** POST: upsert a native platform placement/reference field_definition from catalog template. Admin only. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
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
    const field_key = typeof body.field_key === "string" ? body.field_key.trim() : "";
    const template_key = typeof body.template_key === "string" ? body.template_key.trim() : "";

    let template = field_key
        ? findConfigurablePlacementFieldTemplate(entity_type, field_key)
        : null;

    if (!template && template_key) {
        template =
            listConfigurablePlacementFieldTemplatesForEntity(entity_type).find(
                (t) => t.template_key === template_key,
            ) ?? null;
    }

    if (!template) {
        return NextResponse.json(
            { error: "Unknown placement field template for entity_type / field_key / template_key" },
            { status: 400 },
        );
    }

    if (!template.is_native_system) {
        return NextResponse.json({ error: "Only native platform placement fields can be ensured" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing } = await supabase
        .from("field_definitions")
        .select("id, config")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", template.entity_type)
        .eq("field_key", template.field_key)
        .maybeSingle();

    const mergedConfig = {
        ...(existing?.config != null && typeof existing.config === "object" && !Array.isArray(existing.config)
            ? (existing.config as Record<string, unknown>)
            : {}),
        ...template.config,
    };

    if (existing?.id) {
        const { data: updated, error } = await supabase
            .from("field_definitions")
            .update({
                field_type: template.field_type,
                label: template.operator_label,
                description: template.description,
                section_key: template.section_key,
                sort_order: template.sort_order,
                is_system: true,
                is_active: true,
                is_visible_in_drawer: true,
                is_visible_in_form: true,
                config: mergedConfig,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ action: "updated", field_definition: updated });
    }

    const { data: created, error } = await supabase
        .from("field_definitions")
        .insert({
            org_id: ctx.orgId,
            entity_type: template.entity_type,
            field_key: template.field_key,
            field_type: template.field_type,
            label: template.operator_label,
            description: template.description,
            section_key: template.section_key,
            sort_order: template.sort_order,
            is_system: true,
            is_required: false,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
            is_visible_in_table: false,
            is_filterable: false,
            is_sortable: false,
            config: mergedConfig,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ action: "created", field_definition: created }, { status: 201 });
}

/** GET: list placement field templates for an entity (addable catalog). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    const entityType = new URL(request.url).searchParams.get("entity_type")?.trim().toLowerCase() ?? "";
    if (!entityType) {
        return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    return NextResponse.json({
        templates: listConfigurablePlacementFieldTemplatesForEntity(entityType),
    });
}
