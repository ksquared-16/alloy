/**
 * Legacy opportunity drawer layout convergence — Phase 5.
 *
 * Documents dual-write paths, read-through migration hints, and write-blocking policy
 * when entity_layouts visual configuration is active at runtime.
 */

import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import { setSectionEditorHidden } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    OPPORTUNITY_DRAWER_SECTION_KEYS,
    type OpportunityDrawerSectionKey,
} from "@/lib/layout/surfaceLayoutRegistry";
import { isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledServer } from "@/lib/layout/featureFlag";

/** Active write paths to `record_drawer_layouts` for opportunity workflow v1 (audit). */
export const LEGACY_OPPORTUNITY_DRAWER_LAYOUT_WRITE_PATHS = [
    {
        id: "persist_helper",
        path: "web/lib/admin/recordDrawerLayoutPersist.ts",
        description: "Shared upsert for org drawer layout config_json",
    },
    {
        id: "workflow_v1_sections",
        path: "PATCH /api/admin/record-drawer-layouts/opportunity-workflow-v1-sections",
        description: "Section visibility, titles, overview_section_order",
    },
    {
        id: "workflow_v1_order",
        path: "PATCH /api/admin/record-drawer-layouts/opportunity-workflow-v1-order",
        description: "Drawer section order",
    },
    {
        id: "workflow_v1_field_placements",
        path: "PATCH /api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements",
        description: "field_placements_v1 required/editable overrides",
    },
] as const;

/**
 * Partial key overlap — workflow v1 virtual sections use field-catalog keys; LayoutDoc uses
 * composition section keys. Unmapped legacy keys require manual gallery migration.
 */
export const LEGACY_WORKFLOW_V1_TO_LAYOUT_SECTION_KEY: Partial<
    Record<string, OpportunityDrawerSectionKey>
> = {
    notes: "notes_communication",
};

export type LegacyLayoutMigrationHint = {
    code: string;
    message: string;
};

/** Read-through migration hints from legacy config → entity_layouts (no auto-write). */
export function buildLegacyWorkflowV1LayoutMigrationHints(
    cfg: RecordLayoutConfigJson,
): LegacyLayoutMigrationHint[] {
    const hints: LegacyLayoutMigrationHint[] = [];

    if (cfg.overview_hidden_sections?.length) {
        hints.push({
            code: "hidden_sections",
            message: `Map overview_hidden_sections (${cfg.overview_hidden_sections.join(", ")}) to layoutEditorHidden on matching Layout Gallery sections where keys align.`,
        });
    }
    if (cfg.overview_section_order?.length) {
        hints.push({
            code: "section_order",
            message: `Reorder sections in Layout Gallery to match overview_section_order (${cfg.overview_section_order.join(" → ")}).`,
        });
    }
    if (cfg.field_placements_v1?.length) {
        hints.push({
            code: "field_placements",
            message: `${cfg.field_placements_v1.length} field_placements_v1 row(s) remain on record_drawer_layouts until field-behavior migration.`,
        });
    }

    const unmappedHidden = (cfg.overview_hidden_sections ?? []).filter(
        (k) => !LEGACY_WORKFLOW_V1_TO_LAYOUT_SECTION_KEY[k],
    );
    if (unmappedHidden.length) {
        hints.push({
            code: "unmapped_hidden_keys",
            message: `No automatic LayoutDoc mapping for: ${unmappedHidden.join(", ")}. Use Layout Gallery manually.`,
        });
    }

    return hints;
}

/**
 * Pure read-through: apply mappable legacy hidden flags onto a LayoutDoc (for import/migration scripts).
 * Does not persist; caller saves via entity_layouts APIs.
 */
export function applyMappableLegacyHiddenSectionsToLayoutDoc(
    doc: LayoutDoc,
    cfg: RecordLayoutConfigJson,
): LayoutDoc {
    let next = doc;
    for (const legacyKey of cfg.overview_hidden_sections ?? []) {
        const layoutKey = LEGACY_WORKFLOW_V1_TO_LAYOUT_SECTION_KEY[legacyKey];
        if (!layoutKey) continue;
        if (!(OPPORTUNITY_DRAWER_SECTION_KEYS as readonly string[]).includes(layoutKey)) continue;
        next = setSectionEditorHidden(next, layoutKey, true);
    }
    return next;
}

/** Server: block legacy opportunity layout writes when visual entity_layouts runtime adoption is on. */
export function isLegacyOpportunityDrawerLayoutWriteBlockedServer(): boolean {
    return isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledServer();
}

export const LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_CODE = "legacy_layout_write_blocked" as const;

export const LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_MESSAGE =
    "Legacy opportunity drawer layout writes are disabled while visual layout configuration is active. Use Configuration → Layout Gallery.";
