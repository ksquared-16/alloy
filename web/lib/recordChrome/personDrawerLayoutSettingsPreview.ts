/**
 * Person drawer layout preview for Settings (Sprint A visibility — read-only).
 */

import {
    PERSON_DRAWER_LAYOUT_RUNTIME_MODE,
    PERSON_LAYOUT_VARIANT_CHILD,
    PERSON_LAYOUT_VARIANT_DEFAULTS,
    PERSON_LAYOUT_VARIANT_GENERIC,
    PERSON_LAYOUT_VARIANT_PARENT,
    personDrawerLayoutRuntimeActive,
    type PersonLayoutVariantConfigV1,
    type PersonOperatingSectionKey,
} from "@/lib/admin/person/personDrawerLayoutRuntime";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

export type PersonLayoutVariantProvenance = "record_drawer_layouts" | "code_default";

export type PersonOperatingSectionPreviewRow = {
    position: number;
    section_key: PersonOperatingSectionKey;
    label: string;
};

export type PersonLayoutVariantPreviewRow = {
    variant_key: string;
    label: string;
    presentation_emphasis: string;
    operating_sections: PersonOperatingSectionPreviewRow[];
    overview_section_order?: string[];
    overview_suppressed_sections?: string[];
    variant_provenance: PersonLayoutVariantProvenance;
};

export type PersonRuntimeLayoutSettingsPreview = {
    person_drawer_mode: typeof PERSON_DRAWER_LAYOUT_RUNTIME_MODE | null;
    runtime_v1_active: boolean;
    layout_provenance: PersonLayoutVariantProvenance;
    variants: PersonLayoutVariantPreviewRow[];
};

const CANONICAL_VARIANT_KEYS = [
    PERSON_LAYOUT_VARIANT_CHILD,
    PERSON_LAYOUT_VARIANT_PARENT,
    PERSON_LAYOUT_VARIANT_GENERIC,
] as const;

const VARIANT_OPERATOR_LABELS: Record<string, string> = {
    [PERSON_LAYOUT_VARIANT_CHILD]: "Child operating",
    [PERSON_LAYOUT_VARIANT_PARENT]: "Parent operating",
    [PERSON_LAYOUT_VARIANT_GENERIC]: "Generic person",
};

const OPERATING_SECTION_LABELS: Record<PersonOperatingSectionKey, string> = {
    child_summary: "Child summary",
    parent_summary: "Parent summary",
    household: "Household",
    household_address: "Household address",
    employee_status: "Employee status",
};

function mergeVariantForPreview(
    variantKey: string,
    fromDb: PersonLayoutVariantConfigV1 | undefined
): PersonLayoutVariantConfigV1 {
    const fallback = PERSON_LAYOUT_VARIANT_DEFAULTS[variantKey] ?? PERSON_LAYOUT_VARIANT_DEFAULTS[PERSON_LAYOUT_VARIANT_GENERIC]!;
    if (!fromDb) return { ...fallback };
    return {
        ...fallback,
        ...fromDb,
        person_operating_sections: fromDb.person_operating_sections ?? fallback.person_operating_sections,
        overview_suppressed_sections:
            fromDb.overview_suppressed_sections ?? fallback.overview_suppressed_sections,
        overview_section_order: fromDb.overview_section_order ?? fallback.overview_section_order,
    };
}

function operatingSectionRows(keys: PersonOperatingSectionKey[] | undefined): PersonOperatingSectionPreviewRow[] {
    return (keys ?? []).map((section_key, i) => ({
        position: i + 1,
        section_key,
        label: OPERATING_SECTION_LABELS[section_key] ?? section_key.replace(/_/g, " "),
    }));
}

/**
 * Build read-only person runtime preview for Settings effective-preview API.
 */
export function buildPersonRuntimeLayoutSettingsPreview(
    config: RecordLayoutConfigJson | null | undefined
): PersonRuntimeLayoutSettingsPreview {
    const runtimeActive = personDrawerLayoutRuntimeActive(config);
    const dbVariants = config?.person_layout_variants;
    const mode =
        config?.person_drawer_mode === PERSON_DRAWER_LAYOUT_RUNTIME_MODE
            ? PERSON_DRAWER_LAYOUT_RUNTIME_MODE
            : null;

    const variants: PersonLayoutVariantPreviewRow[] = CANONICAL_VARIANT_KEYS.map((variantKey) => {
        const dbVariant = runtimeActive
            ? (dbVariants?.[variantKey] as PersonLayoutVariantConfigV1 | undefined)
            : undefined;
        const merged = mergeVariantForPreview(variantKey, dbVariant);
        const variantProvenance: PersonLayoutVariantProvenance =
            runtimeActive && dbVariant ? "record_drawer_layouts" : "code_default";

        return {
            variant_key: variantKey,
            label: VARIANT_OPERATOR_LABELS[variantKey] ?? variantKey,
            presentation_emphasis: merged.presentation_emphasis ?? "any",
            operating_sections: operatingSectionRows(merged.person_operating_sections),
            overview_section_order: merged.overview_section_order,
            overview_suppressed_sections: merged.overview_suppressed_sections,
            variant_provenance: variantProvenance,
        };
    });

    const layoutProvenance: PersonLayoutVariantProvenance = runtimeActive
        ? "record_drawer_layouts"
        : "code_default";

    return {
        person_drawer_mode: mode,
        runtime_v1_active: runtimeActive,
        layout_provenance: layoutProvenance,
        variants,
    };
}

export function personOperatingSectionLabel(key: string): string {
    return OPERATING_SECTION_LABELS[key as PersonOperatingSectionKey] ?? key.replace(/_/g, " ");
}
