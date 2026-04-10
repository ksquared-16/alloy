/**
 * Schedule record `config_json.layout_blocks` — structured presentation (v2+).
 * Field entries use the same tokens as `overview_rows` (see `scheduleOverviewRows.ts`).
 */

import { resolveScheduleOverviewRowFieldKey } from "@/lib/admin/scheduleOverviewRows";

/** One labeled cluster inside a snapshot block (e.g. "When", "Assignment"). */
export type ScheduleSnapshotLayoutGroup = {
    label: string;
    /** Tokens → resolved keys via `resolveScheduleOverviewRowFieldKey`. */
    fields: string[];
};

export type ScheduleLayoutBlockSnapshot = {
    type: "snapshot";
    /** Stable id for tooling / future theming. */
    key: string;
    /** Optional heading for the whole snapshot card. */
    title?: string;
    groups: ScheduleSnapshotLayoutGroup[];
};

export type ScheduleLayoutBlockSecondarySummary = {
    type: "secondary_summary";
    key: string;
    fields: string[];
};

/** Order / filter collapsible sections below the chrome (EntityDrawerSectionConfig.key). */
export type ScheduleLayoutBlockSectionGroup = {
    type: "section_group";
    key: string;
    sections: string[];
};

export type ScheduleLayoutBlock =
    | ScheduleLayoutBlockSnapshot
    | ScheduleLayoutBlockSecondarySummary
    | ScheduleLayoutBlockSectionGroup;

export function isScheduleLayoutV2(config: { version?: number; layout_blocks?: unknown } | null | undefined): boolean {
    return config?.version === 2 && Array.isArray(config.layout_blocks) && config.layout_blocks.length > 0;
}

/** First `section_group` block’s section keys, if any. */
export function getSectionOrderFromScheduleLayoutBlocks(
    blocks: ScheduleLayoutBlock[] | undefined
): string[] | null {
    if (!blocks?.length) return null;
    for (const b of blocks) {
        if (b.type === "section_group" && b.sections?.length) return [...b.sections];
    }
    return null;
}

/** All field keys hoisted into snapshot + secondary_summary blocks (for section field stripping). */
export function collectResolvedKeysFromScheduleLayoutBlocks(blocks: ScheduleLayoutBlock[]): Set<string> {
    const keys = new Set<string>();
    for (const b of blocks) {
        if (b.type === "snapshot") {
            for (const g of b.groups) {
                for (const tok of g.fields) {
                    keys.add(resolveScheduleOverviewRowFieldKey(tok));
                }
            }
        } else if (b.type === "secondary_summary") {
            for (const tok of b.fields) {
                keys.add(resolveScheduleOverviewRowFieldKey(tok));
            }
        }
    }
    return keys;
}
