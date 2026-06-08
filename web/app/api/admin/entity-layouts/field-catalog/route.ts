/**
 * Layout V2 — Field & Widget catalog for the builder (read-only).
 *
 *   GET /api/admin/entity-layouts/field-catalog?entity_type=opportunities
 *
 * Returns the V1 entity groups with normalized canonical refKeys, plus the
 * widget catalog. Opportunity, person, and inquiry_child load from
 * field_definitions; child (durable) loads person registry rows as an interim
 * bridge (person ≠ child — durable truth is customer_member).
 *
 * Read-only, org-scoped, flag-gated. Does not touch live runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { isLayoutV2ConfigEnabledServer } from "@/lib/layout/featureFlag";
import {
    CURATED_FIELDS,
    LAYOUT_ENTITY_GROUPS,
    catalogGroupsForEntityType,
    catalogWidgetsForEntityType,
    fieldDefToCatalog,
    mergeCatalogWithCuratedFallback,
    type LayoutCatalogField,
    type LayoutCatalogGroup,
    type LayoutEntityGroupKey,
} from "@/lib/layout/fieldCatalog";
import { INQUIRY_CHILD_ENTITY_TYPE, INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS } from "@/lib/fields/inquiryChildFieldRegistry";

/**
 * Group → field_definitions entity_type (null = curated-only bootstrap).
 * child group reads person rows as interim bridge — not person == child.
 */
const GROUP_FIELD_ENTITY: Record<LayoutEntityGroupKey, string | null> = {
    opportunity: "opportunity",
    person: "person",
    child: "person",
    inquiry_child: INQUIRY_CHILD_ENTITY_TYPE,
};

async function loadGroupFields(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    group: LayoutEntityGroupKey,
): Promise<{ fields: LayoutCatalogField[]; curatedFallback: boolean }> {
    const fieldEntity = GROUP_FIELD_ENTITY[group];
    if (!fieldEntity) {
        return { fields: CURATED_FIELDS[group], curatedFallback: true };
    }

    const { data, error } = await supabase
        .from("field_definitions")
        .select("field_key, label, field_type, section_key, sort_order, is_active, is_visible_in_drawer")
        .eq("org_id", orgId)
        .eq("entity_type", fieldEntity)
        .eq("is_active", true)
        .order("section_key", { ascending: true })
        .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
        return { fields: CURATED_FIELDS[group], curatedFallback: true };
    }

    const registryFields = data.map((r) =>
        fieldDefToCatalog(group, {
            field_key: String((r as { field_key: string }).field_key),
            label: (r as { label?: string | null }).label ?? null,
            field_type: (r as { field_type?: string | null }).field_type ?? null,
        }),
    );

    if (group === "inquiry_child") {
        const present = new Set(registryFields.map((f) => f.fieldKey));
        const missingNative = INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS.filter((k) => !present.has(k));
        const fields =
            missingNative.length > 0 ? mergeCatalogWithCuratedFallback(group, registryFields) : registryFields;
        return { fields, curatedFallback: missingNative.length > 0 };
    }

    if (group === "child") {
        // Interim: person-backed child profile defs + durable curated fallback keys.
        return { fields: mergeCatalogWithCuratedFallback(group, registryFields), curatedFallback: false };
    }

    return { fields: registryFields, curatedFallback: false };
}

export async function GET(request: NextRequest) {
    if (!isLayoutV2ConfigEnabledServer()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type")?.trim() || "opportunities";

    // Candidate / Person / Child surfaces use curated, presentation-only catalogs
    // (no field_definitions); other entities use the field-definition-backed Lead
    // groups below. Widgets are a single GLOBAL catalog on every surface.
    const curatedGroups = catalogGroupsForEntityType(entityType);
    if (curatedGroups) {
        return NextResponse.json({ groups: curatedGroups, widgets: catalogWidgetsForEntityType() });
    }

    const supabase = createAdminClient();
    try {
        const groups: LayoutCatalogGroup[] = [];
        const catalogMeta: { curatedFallbackGroups: LayoutEntityGroupKey[] } = { curatedFallbackGroups: [] };

        for (const g of LAYOUT_ENTITY_GROUPS) {
            const { fields, curatedFallback } = await loadGroupFields(supabase, ctx.orgId, g.entityKey);
            if (curatedFallback) catalogMeta.curatedFallbackGroups.push(g.entityKey);
            groups.push({ entityKey: g.entityKey, entityLabel: g.entityLabel, fields });
        }
        return NextResponse.json({
            groups,
            widgets: catalogWidgetsForEntityType(),
            catalogMeta,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
