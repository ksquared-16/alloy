import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

/** DB row shape for `record_layouts` (admin API). */
export type RecordLayoutRow = {
    id: string;
    entity_type: string;
    key: string;
    config_json: RecordLayoutConfigJson;
    is_active: boolean;
    created_at: string;
};

/** v1 layout payload stored in `config_json`. */
export type RecordLayoutConfigJson = {
    version?: number;
    /** Order of `EntityDrawerSectionConfig.key` values for the record overview. */
    overview_section_order?: string[];
};

/** DB row shape for `record_actions` (admin API). */
export type RecordActionRow = {
    id: string;
    entity_type: string;
    action_key: string;
    label: string;
    event_key: string;
    placement: "primary" | "secondary";
    is_active: boolean;
    created_at: string;
};

/**
 * Reorders overview sections by config keys; unknown keys are appended in original order.
 * Does not touch RRS — operates on presentation sections only.
 */
export function applyOverviewSectionOrder(
    sections: EntityDrawerSectionConfig[],
    order: string[] | undefined
): EntityDrawerSectionConfig[] {
    if (!order?.length) return sections;
    const byKey = new Map(sections.map((s) => [s.key, s]));
    const used = new Set<string>();
    const out: EntityDrawerSectionConfig[] = [];
    for (const k of order) {
        const s = byKey.get(k);
        if (s && !used.has(k)) {
            out.push(s);
            used.add(k);
        }
    }
    for (const s of sections) {
        if (!used.has(s.key)) out.push(s);
    }
    return out;
}
