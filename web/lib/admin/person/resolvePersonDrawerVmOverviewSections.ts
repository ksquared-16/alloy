import {
    getEntityPresentation,
    type EntityDrawerFieldConfig,
    type EntityDrawerSectionConfig,
} from "@/lib/entityPresentation";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import {
    applyPersonDrawerPresentationProfile,
    personDrawerShouldShowEmployeePlacement,
    suppressEmptyChildDetailFields,
} from "@/lib/admin/person/personDrawerPresentationProfile";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import { resolvePersonDrawerProfileFromRecordWithHint } from "@/lib/admin/person/personDrawerChildChrome";
import { personDrawerChildSectionTitle } from "@/lib/admin/person/personDrawerChildHeaderContext";
import type { PersonDrawerParentChromeHint } from "@/lib/admin/person/personDrawerParentChrome";
import { resolvePersonDrawerProfileFromRecordWithParentHint } from "@/lib/admin/person/personDrawerParentChrome";
import { sortOverviewSectionsForChildLifecycle } from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import {
    filterPersonDrawerOverviewSectionsForLayoutRuntime,
    type ResolvedPersonDrawerLayoutVariant,
} from "@/lib/admin/person/personDrawerLayoutRuntime";
import {
    personDrawerChildOperatingOverviewSections,
    personDrawerParentOperatingOverviewSections,
} from "@/lib/admin/person/personDrawerOperatingOverviewSections";
import { personDrawerParentSectionTitle } from "@/lib/admin/person/personDrawerParentHeaderContext";
import { personDrawerHasRelationshipContent } from "@/lib/admin/person/personDrawerRelationshipVisibility";
import { resolvePersonDrawerRelationshipSectionTitle } from "@/lib/admin/person/personDrawerRelationshipSection";

export type PersonDrawerVmChrome = "parent" | "child" | "generic";

type FieldDefRow = {
    field_key: string;
    field_type: string;
    label: string | null;
    section_key: string | null;
    sort_order: number;
    is_visible_in_drawer?: boolean;
};

function hintFromType(t: string): EntityDrawerFieldConfig["renderHint"] {
    if (t === "phone") return "phone";
    if (t === "date") return "date";
    if (t === "datetime") return "datetime";
    if (t === "boolean") return "primary_yes_no";
    return "text";
}

function defaultSectionTitle(sectionKey: string): string {
    return sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1).replace(/_/g, " ");
}

function buildSectionsFromFieldDefinitions(record: Record<string, unknown>): EntityDrawerSectionConfig[] {
    const defs = (record._field_definitions as FieldDefRow[] | undefined) ?? [];
    let visible = defs.filter((d) => d.is_visible_in_drawer !== false);
    visible = visible.filter(
        (d) => !new Set(["is_employee", "employee_id", "employee_source"]).has(d.field_key)
    );
    if (visible.length === 0) return [];

    const bySection = new Map<string, FieldDefRow[]>();
    for (const d of visible) {
        const sk = d.section_key ?? "details";
        if (!bySection.has(sk)) bySection.set(sk, []);
        bySection.get(sk)!.push(d);
    }
    const sectionOrder = [...bySection.entries()].sort((a, b) => {
        const aMin = Math.min(...a[1].map((f) => f.sort_order));
        const bMin = Math.min(...b[1].map((f) => f.sort_order));
        return aMin - bMin;
    });
    const sectionTitleByKey = new Map(
        (
            (record._field_sections ?? []) as {
                section_key: string;
                label: string;
            }[]
        ).map((s) => [s.section_key, s.label])
    );

    return sectionOrder.map(([sectionKey, fields]) => ({
        key: sectionKey,
        title: sectionTitleByKey.get(sectionKey) ?? defaultSectionTitle(sectionKey),
        defaultExpanded: true,
        collapsible: true,
        gridCols: 2 as const,
        fields: fields
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((f) => ({
                key: f.field_key,
                label: f.label ?? f.field_key,
                span: 1 as const,
                renderHint: hintFromType(f.field_type),
                editable: true,
            })),
    }));
}

function appendGenericPersonSections(
    record: Record<string, unknown>,
    sectionBlocks: EntityDrawerSectionConfig[]
): EntityDrawerSectionConfig[] {
    const keys = new Set(sectionBlocks.map((s) => s.key));
    const append: EntityDrawerSectionConfig[] = [];
    const personPres = (getEntityPresentation("persons").drawer?.overviewSections ??
        []) as EntityDrawerSectionConfig[];
    const enrollmentRows = (record._enrollment_mirror as unknown[]) ?? [];
    const enrollmentOpps = (record._enrollment_opportunities as unknown[]) ?? [];
    if (!keys.has("employee_placement")) {
        const profile = resolvePersonDrawerProfileFromRecord(record);
        const emp = personPres.find((s) => s.key === "employee_placement");
        if (emp && personDrawerShouldShowEmployeePlacement(profile)) append.push(emp);
    }
    if (!keys.has("enrollment_activity") && (enrollmentRows.length > 0 || enrollmentOpps.length > 0)) {
        append.push({
            key: "enrollment_activity",
            title: "Enrollment activity",
            defaultExpanded: true,
            collapsible: true,
            gridCols: 1 as const,
            fields: [],
            contentLayout: "block",
        });
    }
    if (
        !keys.has("relationships") &&
        personDrawerHasRelationshipContent(record, resolvePersonDrawerProfileFromRecord(record))
    ) {
        const relProfile = resolvePersonDrawerProfileFromRecord(record);
        append.push({
            key: "relationships",
            title: resolvePersonDrawerRelationshipSectionTitle(relProfile),
            defaultExpanded: relProfile.profiles.includes("child") || relProfile.display === "mixed",
            collapsible: true,
            gridCols: 1 as const,
            fields: [],
        });
    }
    return [...sectionBlocks, ...append];
}

/**
 * Overview sections for Person/Child VM — mirrors legacy `configDrivenOverviewSections` person branch.
 */
export function resolvePersonDrawerVmOverviewSections(args: {
    record: Record<string, unknown>;
    chrome: PersonDrawerVmChrome;
    layoutVariant: ResolvedPersonDrawerLayoutVariant;
    parentChromeHint?: PersonDrawerParentChromeHint | null;
    childChromeHint?: PersonDrawerChildChromeHint | null;
}): EntityDrawerSectionConfig[] | undefined {
    const { record, chrome, layoutVariant } = args;
    if ((record as { _create?: boolean })._create) return undefined;

    let sectionBlocks = buildSectionsFromFieldDefinitions(record);
    const personPres = (getEntityPresentation("persons").drawer?.overviewSections ??
        []) as EntityDrawerSectionConfig[];
    if (sectionBlocks.length === 0 && chrome === "generic") {
        sectionBlocks = [...personPres];
    }

    if (chrome === "generic") {
        sectionBlocks = appendGenericPersonSections(record, sectionBlocks);
    }

    const profile =
        chrome === "parent" ?
            resolvePersonDrawerProfileFromRecordWithParentHint(record, args.parentChromeHint ?? null)
        : chrome === "child" ?
            resolvePersonDrawerProfileFromRecordWithHint(record, args.childChromeHint ?? null)
        :   resolvePersonDrawerProfileFromRecord(record);

    const fieldTypesByKey: Record<string, string> = {};
    for (const d of (record._field_definitions as FieldDefRow[] | undefined) ?? []) {
        fieldTypesByKey[d.field_key] = d.field_type;
    }

    let overviewSections = applyPersonDrawerPresentationProfile(sectionBlocks, profile, fieldTypesByKey, {
        parentOperatingChrome: chrome === "parent",
    });

    if (chrome === "parent" || chrome === "child") {
        const titled = overviewSections.map((s) => ({
            ...s,
            title:
                chrome === "parent" ?
                    personDrawerParentSectionTitle(s.key, s.title)
                :   personDrawerChildSectionTitle(s.key, s.title),
        }));
        overviewSections = filterPersonDrawerOverviewSectionsForLayoutRuntime(titled, layoutVariant);
        if (chrome === "child") {
            overviewSections = suppressEmptyChildDetailFields(overviewSections, record);
            overviewSections = personDrawerChildOperatingOverviewSections(
                sortOverviewSectionsForChildLifecycle(overviewSections)
                    .filter((s) => s.key !== "child_lifecycle_roadmap" && s.key !== "enrollment_activity")
                    .map((s) => ({
                        ...s,
                        title: personDrawerChildSectionTitle(s.key, s.title),
                    }))
            );
            overviewSections = suppressEmptyChildDetailFields(overviewSections, record);
        } else {
            overviewSections = personDrawerParentOperatingOverviewSections(
                overviewSections.map((s) => ({
                    ...s,
                    title: personDrawerParentSectionTitle(s.key, s.title),
                }))
            );
        }
    }

    return overviewSections.length > 0 ? overviewSections : undefined;
}
