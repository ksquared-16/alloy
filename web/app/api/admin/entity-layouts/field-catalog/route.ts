/**
 * Layout V2 — Field & Widget catalog for the builder (read-only).
 *
 *   GET /api/admin/entity-layouts/field-catalog?entity_type=opportunities
 *
 * Returns canonical, manifest-filtered refKeys safe for /adminV2/settings/layouts.
 * Opportunity, person, inquiry_child, customer, and location load from
 * field_definitions where seeded; durable child native columns bootstrap from manifest.
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
    buildLeadLayoutPickerGroups,
    catalogGroupsForEntityType,
    catalogWidgetsForEntityType,
    fieldDefToCatalog,
    layoutPickerAnchorForEntityType,
    mergeCatalogWithCuratedFallback,
    usesCanonicalPickerFilter,
    type LayoutCatalogField,
    type LayoutCatalogGroup,
    type LayoutEntityGroupKey,
} from "@/lib/layout/fieldCatalog";
import {
    computeInquiryChildNativeParityGaps,
    type InquiryChildFieldDefRow,
} from "@/lib/fields/inquiryChildFieldParity";
import {
    computeCustomerMemberConfigParityGaps,
    type CustomerMemberFieldDefRow,
} from "@/lib/fields/customerMemberFieldParity";
import { INQUIRY_CHILD_ENTITY_TYPE, INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS } from "@/lib/fields/inquiryChildFieldRegistry";
import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS } from "@/lib/fields/customerMemberFieldRegistry";
import {
    collectRefKeysFromCatalogGroups,
    isBlockedLayoutPickerRefKey,
} from "@/lib/layout/platformFieldResolutionManifest";
import {
    CHILDCARE_DEF_ENTITY_BY_LOAD_GROUP,
    isChildcareCatalogRefKey,
} from "@/lib/layout/childcareLayoutFieldCatalog";
import {
    filterCatalogGroupsForDrawerSurface,
} from "@/lib/layout/surfaceLayoutRegistry";

/** Group → field_definitions entity_type (null = manifest bootstrap only). */
const GROUP_FIELD_ENTITY: Record<LayoutEntityGroupKey, string | null> = {
    opportunity: CHILDCARE_DEF_ENTITY_BY_LOAD_GROUP.opportunity,
    person: CHILDCARE_DEF_ENTITY_BY_LOAD_GROUP.person,
    child: CHILDCARE_DEF_ENTITY_BY_LOAD_GROUP.child,
    inquiry_child: INQUIRY_CHILD_ENTITY_TYPE,
    customer: CHILDCARE_DEF_ENTITY_BY_LOAD_GROUP.customer,
    location: CHILDCARE_DEF_ENTITY_BY_LOAD_GROUP.location,
};

function filterLoadedFields(
    group: LayoutEntityGroupKey,
    fields: LayoutCatalogField[],
    anchor: ReturnType<typeof layoutPickerAnchorForEntityType>,
): LayoutCatalogField[] {
    return fields.filter(
        (f) => !isBlockedLayoutPickerRefKey(f.refKey) && isChildcareCatalogRefKey(f.refKey, anchor),
    );
}

async function loadGroupFields(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    group: LayoutEntityGroupKey,
    anchor: ReturnType<typeof layoutPickerAnchorForEntityType>,
): Promise<{ fields: LayoutCatalogField[]; curatedFallback: boolean; inquiryChildParityGaps: string[] }> {
    const fieldEntity = GROUP_FIELD_ENTITY[group];
    let inquiryChildParityGaps: string[] = [];

    if (!fieldEntity) {
        return {
            fields: filterLoadedFields(group, CURATED_FIELDS[group], anchor),
            curatedFallback: true,
            inquiryChildParityGaps,
        };
    }

    const { data, error } = await supabase
        .from("field_definitions")
        .select("field_key, label, field_type, section_key, sort_order, is_active, is_visible_in_drawer, entity_type")
        .eq("org_id", orgId)
        .eq("entity_type", fieldEntity)
        .eq("is_active", true)
        .order("section_key", { ascending: true })
        .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
        return {
            fields: filterLoadedFields(group, CURATED_FIELDS[group], anchor),
            curatedFallback: true,
            inquiryChildParityGaps:
                group === "inquiry_child"
                    ? [...INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS]
                    : group === "child"
                      ? [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]
                      : inquiryChildParityGaps,
        };
    }

    const registryFields = data.map((r) =>
        fieldDefToCatalog(group, {
            field_key: String((r as { field_key: string }).field_key),
            label: (r as { label?: string | null }).label ?? null,
            field_type: (r as { field_type?: string | null }).field_type ?? null,
        }),
    );

    if (group === "inquiry_child") {
        inquiryChildParityGaps = computeInquiryChildNativeParityGaps(data as InquiryChildFieldDefRow[]);
        const merged =
            inquiryChildParityGaps.length > 0 ? mergeCatalogWithCuratedFallback(group, registryFields) : registryFields;
        return {
            fields: filterLoadedFields(group, merged, anchor),
            curatedFallback: inquiryChildParityGaps.length > 0,
            inquiryChildParityGaps,
        };
    }

    if (group === "child") {
        const configParityGaps = computeCustomerMemberConfigParityGaps(data as CustomerMemberFieldDefRow[]);
        const merged =
            configParityGaps.length > 0 ? mergeCatalogWithCuratedFallback(group, registryFields) : registryFields;
        return {
            fields: filterLoadedFields(group, merged, anchor),
            curatedFallback: configParityGaps.length > 0,
            inquiryChildParityGaps,
        };
    }

    return {
        fields: filterLoadedFields(group, registryFields, anchor),
        curatedFallback: false,
        inquiryChildParityGaps,
    };
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
    const anchor = layoutPickerAnchorForEntityType(entityType);

    const curatedGroups = catalogGroupsForEntityType(entityType);
    if (curatedGroups) {
        return NextResponse.json({
            groups: curatedGroups,
            widgets: catalogWidgetsForEntityType(),
            catalogMeta: { anchorEntity: anchor, canonicalPickerFilter: usesCanonicalPickerFilter(entityType) },
        });
    }

    const supabase = createAdminClient();
    try {
        const rawGroups: LayoutCatalogGroup[] = [];
        const catalogMeta: {
            curatedFallbackGroups: LayoutEntityGroupKey[];
            inquiryChildParityGaps: string[];
            anchorEntity: typeof anchor;
        } = { curatedFallbackGroups: [], inquiryChildParityGaps: [], anchorEntity: anchor };

        for (const g of LAYOUT_ENTITY_GROUPS) {
            const { fields, curatedFallback, inquiryChildParityGaps } = await loadGroupFields(
                supabase,
                ctx.orgId,
                g.entityKey,
                anchor,
            );
            if (curatedFallback) catalogMeta.curatedFallbackGroups.push(g.entityKey);
            if (inquiryChildParityGaps.length > 0) {
                catalogMeta.inquiryChildParityGaps = inquiryChildParityGaps;
            }
            if (fields.length > 0) {
                rawGroups.push({ entityKey: g.entityKey, entityLabel: g.entityLabel, fields });
            }
        }

        let groups = buildLeadLayoutPickerGroups(rawGroups, anchor);
        if (entityType === "opportunities") {
            groups = filterCatalogGroupsForDrawerSurface("opportunity_drawer", groups);
        } else if (entityType === "persons" || entityType === "person") {
            groups = filterCatalogGroupsForDrawerSurface("person_drawer", groups);
        } else if (entityType === "customer_members" || entityType === "child") {
            groups = filterCatalogGroupsForDrawerSurface("child_drawer", groups);
        }
        const emittedRefKeys = collectRefKeysFromCatalogGroups(groups);

        return NextResponse.json({
            groups,
            widgets: catalogWidgetsForEntityType(),
            catalogMeta: {
                ...catalogMeta,
                emittedRefKeyCount: emittedRefKeys.length,
            },
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
