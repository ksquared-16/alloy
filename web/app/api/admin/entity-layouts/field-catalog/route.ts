/**
 * Layout V2 — Field & Widget catalog for the builder (read-only).
 *
 *   GET /api/admin/entity-layouts/field-catalog?entity_type=opportunities
 *
 * Returns the V1 entity groups (Lead/Opportunity, Person/Contact, Child,
 * Children Inquiry) with normalized fields, plus the widget catalog. Lead and
 * Person fields are sourced from field_definitions (singular field-entity key);
 * Child / Children-Inquiry use curated fields (no clean field-def surface yet).
 *
 * Read-only, org-scoped, flag-gated. Does not touch live runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { isLayoutV2PreviewEnabledServer } from "@/lib/layout/featureFlag";
import {
    CURATED_FIELDS,
    LAYOUT_ENTITY_GROUPS,
    LAYOUT_WIDGET_CATALOG,
    catalogGroupsForEntityType,
    fieldDefToCatalog,
    type LayoutCatalogField,
    type LayoutCatalogGroup,
    type LayoutEntityGroupKey,
} from "@/lib/layout/fieldCatalog";

/** Group → which field_definitions entity_type to read (null = curated only). */
const GROUP_FIELD_ENTITY: Record<LayoutEntityGroupKey, string | null> = {
    opportunity: "opportunity",
    person: "person",
    child: null,
    child_inquiry: null,
};

async function loadGroupFields(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    group: LayoutEntityGroupKey,
): Promise<LayoutCatalogField[]> {
    const fieldEntity = GROUP_FIELD_ENTITY[group];
    if (!fieldEntity) return CURATED_FIELDS[group];

    const { data, error } = await supabase
        .from("field_definitions")
        .select("field_key, label, field_type, section_key, sort_order, is_active, is_visible_in_drawer")
        .eq("org_id", orgId)
        .eq("entity_type", fieldEntity)
        .eq("is_active", true)
        .order("section_key", { ascending: true })
        .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
        // Fall back to curated fields so the picker is never empty.
        return CURATED_FIELDS[group];
    }
    return data.map((r) =>
        fieldDefToCatalog(group, {
            field_key: String((r as { field_key: string }).field_key),
            label: (r as { label?: string | null }).label ?? null,
            field_type: (r as { field_type?: string | null }).field_type ?? null,
        }),
    );
}

export async function GET(request: NextRequest) {
    if (!isLayoutV2PreviewEnabledServer()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type")?.trim() || "opportunities";

    // Waitlist candidate surface uses a curated, presentation-only catalog
    // (no field_definitions); other entities use the Leads/opportunities groups.
    const curatedGroups = catalogGroupsForEntityType(entityType);
    if (curatedGroups) {
        return NextResponse.json({ groups: curatedGroups, widgets: LAYOUT_WIDGET_CATALOG });
    }

    const supabase = createAdminClient();
    try {
        const groups: LayoutCatalogGroup[] = [];
        for (const g of LAYOUT_ENTITY_GROUPS) {
            const fields = await loadGroupFields(supabase, ctx.orgId, g.entityKey);
            groups.push({ entityKey: g.entityKey, entityLabel: g.entityLabel, fields });
        }
        return NextResponse.json({ groups, widgets: LAYOUT_WIDGET_CATALOG });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
