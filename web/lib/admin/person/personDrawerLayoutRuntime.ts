import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import { PERSON_DRAWER_CHILD_SUPPRESSED_SECTION_KEYS } from "@/lib/admin/person/personDrawerChildOperatingSections";
import { PERSON_DRAWER_CHILD_DEDICATED_FIELD_KEYS } from "@/lib/admin/person/personDrawerChildOperatingSections";
import { PERSON_DRAWER_PARENT_SUPPRESSED_SECTION_KEYS } from "@/lib/admin/person/personDrawerParentOperatingSections";
import { PERSON_DRAWER_PARENT_DEDICATED_FIELD_KEYS } from "@/lib/admin/person/personDrawerParentOperatingSections";
import {
    PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
    type PersonDrawerChildChromeHint,
} from "@/lib/admin/person/personDrawerChildChrome";
import {
    PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
    type PersonDrawerParentChromeHint,
} from "@/lib/admin/person/personDrawerParentChrome";
import type { PersonDrawerPresentationEmphasis } from "@/lib/admin/person/personDrawerPresentationEmphasis";

/** Built-in operating modules rendered above config-driven overview. */
export type PersonOperatingSectionKey =
    | "child_summary"
    | "parent_summary"
    | "household"
    | "household_address"
    | "employee_status";

export type PersonLayoutVariantConfigV1 = {
    /** Matches `PersonDrawerPresentationEmphasis` or open-seed emphasis string. */
    presentation_emphasis?: PersonDrawerPresentationEmphasis | "any";
    person_operating_sections?: PersonOperatingSectionKey[];
    overview_section_order?: string[];
    overview_hidden_sections?: string[];
    /** Config-driven replacement for TS operating suppression lists. */
    overview_suppressed_sections?: string[];
    dedicated_field_keys?: string[];
};

export type PersonLayoutVariantsConfigV1 = Record<string, PersonLayoutVariantConfigV1>;

export const PERSON_DRAWER_LAYOUT_RUNTIME_MODE = "runtime_v1" as const;

export const PERSON_LAYOUT_VARIANT_CHILD = "person_child_operating_v1";
export const PERSON_LAYOUT_VARIANT_PARENT = "person_parent_operating_v1";
export const PERSON_LAYOUT_VARIANT_GENERIC = "person_generic_v1";

/** Code fallback when no DB layout row exists — preserves pre-runtime behavior. */
export const PERSON_LAYOUT_VARIANT_DEFAULTS: PersonLayoutVariantsConfigV1 = {
    [PERSON_LAYOUT_VARIANT_CHILD]: {
        presentation_emphasis: "child_lifecycle",
        person_operating_sections: ["child_summary", "household"],
        overview_suppressed_sections: [
            ...PERSON_DRAWER_CHILD_SUPPRESSED_SECTION_KEYS,
            "child_lifecycle_roadmap",
            "enrollment_activity",
        ],
        dedicated_field_keys: [...PERSON_DRAWER_CHILD_DEDICATED_FIELD_KEYS],
    },
    [PERSON_LAYOUT_VARIANT_PARENT]: {
        presentation_emphasis: "guardian_communication",
        person_operating_sections: ["parent_summary", "household", "household_address", "employee_status"],
        overview_suppressed_sections: [...PERSON_DRAWER_PARENT_SUPPRESSED_SECTION_KEYS],
        dedicated_field_keys: [...PERSON_DRAWER_PARENT_DEDICATED_FIELD_KEYS],
    },
    [PERSON_LAYOUT_VARIANT_GENERIC]: {
        presentation_emphasis: "general_identity",
        person_operating_sections: [],
        overview_section_order: ["basic_info", "contact_info", "employee_placement", "relationships"],
    },
};

export type ResolvedPersonDrawerLayoutVariant = {
    variant_key: string;
    source: "record_drawer_layouts" | "code_default";
    config: PersonLayoutVariantConfigV1;
};

export type PersonDrawerLayoutResolveContext = {
    childOperatingChrome: boolean;
    parentOperatingChrome: boolean;
    childChromeHint?: PersonDrawerChildChromeHint | null;
    parentChromeHint?: PersonDrawerParentChromeHint | null;
};

function emphasisFromHints(ctx: PersonDrawerLayoutResolveContext): PersonDrawerPresentationEmphasis | null {
    const seed =
        ctx.childChromeHint?.presentation_emphasis ?? ctx.parentChromeHint?.presentation_emphasis ?? null;
    if (seed === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) return "child_lifecycle";
    if (seed === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) return "guardian_communication";
    return null;
}

function pickVariantKey(ctx: PersonDrawerLayoutResolveContext): string {
    if (ctx.childOperatingChrome) return PERSON_LAYOUT_VARIANT_CHILD;
    if (ctx.parentOperatingChrome) return PERSON_LAYOUT_VARIANT_PARENT;
    return PERSON_LAYOUT_VARIANT_GENERIC;
}

function mergeVariantConfig(
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
        dedicated_field_keys: fromDb.dedicated_field_keys ?? fallback.dedicated_field_keys,
        overview_section_order: fromDb.overview_section_order ?? fallback.overview_section_order,
    };
}

/**
 * Resolve effective person drawer layout variant for the current operating context.
 * When `person_drawer_mode === runtime_v1` and DB variants exist, `source` is `record_drawer_layouts`.
 */
export function resolvePersonDrawerLayoutVariant(
    layoutConfig: RecordLayoutConfigJson | null | undefined,
    ctx: PersonDrawerLayoutResolveContext
): ResolvedPersonDrawerLayoutVariant {
    const variantKey = pickVariantKey(ctx);
    const dbVariants = layoutConfig?.person_layout_variants;
    const runtimeFromDb =
        layoutConfig?.person_drawer_mode === PERSON_DRAWER_LAYOUT_RUNTIME_MODE &&
        dbVariants &&
        Object.keys(dbVariants).length > 0;

    const dbVariant = runtimeFromDb ? (dbVariants[variantKey] as PersonLayoutVariantConfigV1 | undefined) : undefined;
    const config = mergeVariantConfig(variantKey, dbVariant);

    // Hint emphasis can refine generic fallback when chrome flags are not yet hydrated.
    if (!ctx.childOperatingChrome && !ctx.parentOperatingChrome) {
        const hintEmphasis = emphasisFromHints(ctx);
        if (hintEmphasis === "child_lifecycle" && runtimeFromDb && dbVariants[PERSON_LAYOUT_VARIANT_CHILD]) {
            return {
                variant_key: PERSON_LAYOUT_VARIANT_CHILD,
                source: "record_drawer_layouts",
                config: mergeVariantConfig(
                    PERSON_LAYOUT_VARIANT_CHILD,
                    dbVariants[PERSON_LAYOUT_VARIANT_CHILD] as PersonLayoutVariantConfigV1
                ),
            };
        }
        if (hintEmphasis === "guardian_communication" && runtimeFromDb && dbVariants[PERSON_LAYOUT_VARIANT_PARENT]) {
            return {
                variant_key: PERSON_LAYOUT_VARIANT_PARENT,
                source: "record_drawer_layouts",
                config: mergeVariantConfig(
                    PERSON_LAYOUT_VARIANT_PARENT,
                    dbVariants[PERSON_LAYOUT_VARIANT_PARENT] as PersonLayoutVariantConfigV1
                ),
            };
        }
    }

    return {
        variant_key: variantKey,
        source: runtimeFromDb && dbVariant ? "record_drawer_layouts" : "code_default",
        config,
    };
}

export function personDrawerLayoutRuntimeActive(
    layoutConfig: RecordLayoutConfigJson | null | undefined
): boolean {
    return (
        layoutConfig?.person_drawer_mode === PERSON_DRAWER_LAYOUT_RUNTIME_MODE &&
        Boolean(layoutConfig.person_layout_variants && Object.keys(layoutConfig.person_layout_variants).length > 0)
    );
}

export function filterPersonDrawerOverviewSectionsForLayoutRuntime<
    T extends { key: string; fields?: { key: string }[] },
>(sections: T[], variant: ResolvedPersonDrawerLayoutVariant): T[] {
    const suppressed = new Set(variant.config.overview_suppressed_sections ?? []);
    const hidden = new Set(variant.config.overview_hidden_sections ?? []);
    const dedicated = new Set(variant.config.dedicated_field_keys ?? []);

    let out: T[] = sections
        .filter((section) => !suppressed.has(section.key) && !hidden.has(section.key))
        .map((section) => ({
            ...section,
            fields: (section.fields ?? []).filter((f) => !dedicated.has(f.key)),
        }))
        .filter((section) => (section.fields?.length ?? 0) > 0);

    const order = variant.config.overview_section_order;
    if (order?.length) {
        const byKey = new Map(out.map((s) => [s.key, s]));
        const used = new Set<string>();
        const ordered: T[] = [];
        for (const key of order) {
            const section = byKey.get(key);
            if (section && !used.has(key)) {
                ordered.push(section);
                used.add(key);
            }
        }
        for (const section of out) {
            if (!used.has(section.key)) ordered.push(section);
        }
        out = ordered;
    }
    return out;
}

export function resolvePersonOperatingSections(
    variant: ResolvedPersonDrawerLayoutVariant
): PersonOperatingSectionKey[] {
    return variant.config.person_operating_sections ?? [];
}
