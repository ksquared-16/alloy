import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import type { ScheduleLayoutBlock } from "@/lib/recordChrome/scheduleLayoutConfig";

/** DB row shape for `record_layouts` (admin API). */
export type RecordLayoutRow = {
    id: string;
    entity_type: string;
    key: string;
    config_json: RecordLayoutConfigJson;
    is_active: boolean;
    created_at: string;
};

/**
 * `record_layouts.config_json` — versioned; v2 adds `layout_blocks` for schedules.
 * Legacy clients may still read `overview_rows` alone.
 */
export type RecordLayoutConfigJson = {
    version?: number;
    /** Order of `EntityDrawerSectionConfig.key` for the record overview. `tour_scheduling` is legacy — UI suppresses it (tour lives in inquiry summary). */
    overview_section_order?: string[];
    /**
     * Opportunity drawer (org override): when `inquiry_drawer_mode` is set, the UI may apply
     * inquiry-specific chrome (workflow sections, quote suppression, etc.). See `AdminEntityDrawer`.
     */
    inquiry_drawer_mode?: "workflow_v1";
    /**
     * Opportunity drawer: hide config-driven overview sections whose `section_key` matches
     * one of these strings (field_definitions grouping).
     */
    overview_hidden_sections?: string[];
    /**
     * When true, omit the injected `__unified_status` overview section for opportunities
     * (status lives in the drawer header snapshot only).
     */
    suppress_body_status?: boolean;
    /**
     * Opportunity inquiry workflow: synthetic overview sections built from visible field_definitions
     * by `field_key` (source sections may be hidden via `overview_hidden_sections`).
     */
    inquiry_workflow_sections?: {
        key: string;
        title: string;
        field_keys: string[];
        /** When true, render the section even if no field_definitions map (custom panel only). */
        allow_empty?: boolean;
        default_expanded?: boolean;
    }[];
    /**
     * Schedule v1: each inner array is one visual row (2–4 field tokens).
     * Tokens map via `SCHEDULE_OVERVIEW_ROW_TOKEN_TO_FIELD_KEY` → field keys.
     */
    overview_rows?: string[][];

    /**
     * Schedule v2+: structured blocks (snapshot, secondary summary, section order).
     * When `version === 2` and `layout_blocks` is non-empty, UI prefers blocks; `overview_rows` remains for backward compatibility.
     */
    layout_blocks?: ScheduleLayoutBlock[];
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

/** True when org drawer layout lists this overview section (order or inquiry workflow defs). */
export function recordOpportunityDrawerLayoutIncludesSection(
    cfg: RecordLayoutConfigJson | null | undefined,
    sectionKey: string
): boolean {
    if (!cfg) return false;
    const order = cfg.overview_section_order;
    if (Array.isArray(order) && order.some((k) => k === sectionKey)) return true;
    const ws = cfg.inquiry_workflow_sections;
    if (Array.isArray(ws) && ws.some((s) => s?.key === sectionKey)) return true;
    return false;
}
