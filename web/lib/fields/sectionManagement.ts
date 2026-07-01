/**
 * Field section management utilities (Configuration / Layout Assist V1 — Card 3).
 */

export const FIELD_SECTION_CONFIG_VERSION = 1 as const;

export type SectionLayoutVisibilityRuleV1 = {
    entity_type: string;
    layout_key?: string;
    surface?: string;
    hidden?: boolean;
};

export type FieldSectionConfigV1 = {
    version: typeof FIELD_SECTION_CONFIG_VERSION;
    /** Hide this section on specific layout surfaces (Card 3.E). */
    layout_visibility?: SectionLayoutVisibilityRuleV1[];
};

export type FieldSectionRow = {
    id?: string;
    section_key: string;
    entity_type: string;
    label: string;
    sort_order: number;
    is_archived?: boolean;
    section_config?: unknown | null;
};

export type ParseFieldSectionConfigResult =
    | { ok: true; value: FieldSectionConfigV1 }
    | { ok: false; error: string };

export function parseFieldSectionConfig(raw: unknown): ParseFieldSectionConfigResult {
    if (raw == null || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
        return { ok: true, value: { version: FIELD_SECTION_CONFIG_VERSION, layout_visibility: [] } };
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "section_config must be an object" };
    }
    const o = raw as Record<string, unknown>;
    if (o.version !== undefined && o.version !== FIELD_SECTION_CONFIG_VERSION) {
        return { ok: false, error: `section_config.version must be ${FIELD_SECTION_CONFIG_VERSION}` };
    }
    const rules: SectionLayoutVisibilityRuleV1[] = [];
    if (o.layout_visibility !== undefined) {
        if (!Array.isArray(o.layout_visibility)) {
            return { ok: false, error: "layout_visibility must be an array" };
        }
        for (const item of o.layout_visibility) {
            if (item == null || typeof item !== "object" || Array.isArray(item)) {
                return { ok: false, error: "layout_visibility entries must be objects" };
            }
            const r = item as Record<string, unknown>;
            const entity_type = typeof r.entity_type === "string" ? r.entity_type.trim() : "";
            if (!entity_type) return { ok: false, error: "layout_visibility.entity_type is required" };
            rules.push({
                entity_type,
                layout_key: typeof r.layout_key === "string" ? r.layout_key.trim() : undefined,
                surface: typeof r.surface === "string" ? r.surface.trim() : undefined,
                hidden: r.hidden === undefined ? true : !!r.hidden,
            });
        }
    }
    return { ok: true, value: { version: FIELD_SECTION_CONFIG_VERSION, layout_visibility: rules } };
}

/** Deterministic sort: sort_order asc, then section_key. */
export function normalizeSectionSortOrders<T extends { section_key: string; sort_order: number }>(
    sections: T[]
): T[] {
    return [...sections].sort((a, b) => a.sort_order - b.sort_order || a.section_key.localeCompare(b.section_key));
}

export type ValidateSectionReorderResult = { ok: true; ordered_keys: string[] } | { ok: false; error: string };

/**
 * Validate a proposed section_key order is a permutation of known keys.
 */
export function validateSectionReorder(
    proposedOrder: string[],
    existingSections: { section_key: string }[]
): ValidateSectionReorderResult {
    const known = new Set(existingSections.map((s) => s.section_key));
    const seen = new Set<string>();
    for (const key of proposedOrder) {
        const k = key.trim();
        if (!k) return { ok: false, error: "section order contains empty key" };
        if (!known.has(k)) return { ok: false, error: `unknown section_key: ${k}` };
        if (seen.has(k)) return { ok: false, error: `duplicate section_key in order: ${k}` };
        seen.add(k);
    }
    if (seen.size !== known.size) {
        return { ok: false, error: "section order must include every section exactly once" };
    }
    return { ok: true, ordered_keys: [...proposedOrder] };
}

export type SectionDeleteSafetyResult =
    | { ok: true }
    | { ok: false; error: string; field_definition_count: number };

/** Block hard delete when fields still reference section_key (existing API behavior, centralized). */
export function assertSectionSafeToDelete(
    section_key: string,
    field_definition_count: number
): SectionDeleteSafetyResult {
    if (field_definition_count > 0) {
        return {
            ok: false,
            error: `Cannot delete: ${field_definition_count} field definition(s) still use section_key "${section_key}".`,
            field_definition_count,
        };
    }
    return { ok: true };
}

export type ValidateFieldSectionAssignmentResult = { ok: true } | { ok: false; error: string };

export function validateFieldSectionAssignment(input: {
    section_key: string;
    entity_type: string;
    sections: { section_key: string; entity_type: string; is_archived?: boolean }[];
}): ValidateFieldSectionAssignmentResult {
    const match = input.sections.find(
        (s) => s.entity_type === input.entity_type && s.section_key === input.section_key
    );
    if (!match) {
        return {
            ok: false,
            error: `section_key "${input.section_key}" is not defined for entity_type "${input.entity_type}"`,
        };
    }
    if (match.is_archived) {
        return { ok: false, error: `section "${input.section_key}" is archived` };
    }
    return { ok: true };
}

export function isSectionHiddenOnLayout(
    section: { section_config?: unknown | null },
    rule: { entity_type: string; layout_key?: string; surface?: string }
): boolean {
    const parsed = parseFieldSectionConfig(section.section_config ?? {});
    if (!parsed.ok) return false;
    const rules = parsed.value.layout_visibility ?? [];
    return rules.some((r) => {
        if (r.entity_type !== rule.entity_type) return false;
        if (r.layout_key && rule.layout_key && r.layout_key !== rule.layout_key) return false;
        if (r.surface && rule.surface && r.surface !== rule.surface) return false;
        return r.hidden !== false;
    });
}

/** Assign contiguous sort_order values (10, 20, 30, …) after reorder. */
export function sectionSortOrdersFromKeyOrder(orderedKeys: string[], start = 10, step = 10): Record<string, number> {
    const out: Record<string, number> = {};
    orderedKeys.forEach((key, i) => {
        out[key] = start + i * step;
    });
    return out;
}
