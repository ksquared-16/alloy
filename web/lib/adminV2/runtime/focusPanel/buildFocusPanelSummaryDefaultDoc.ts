/**
 * Code-built default `LayoutDoc` for the Enrollment Focus Panel Summary.
 *
 * This is the system default that reproduces today's hardcoded `SUMMARY_GRID`
 * exactly, so enabling `FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED` is visually a no-op
 * (read path + parity). Later phases resolve a published org doc from
 * `entity_layouts`; this remains the fallback when none is published.
 */

import { SUMMARY_GRID } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import {
    buildFocusPanelCardSection,
    FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
    FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
    FOCUS_PANEL_SUMMARY_SURFACE,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc, type LayoutSection } from "@/lib/layout/layoutV2";

/** Build the default Focus Panel Summary doc by re-encoding `SUMMARY_GRID`. */
export function buildFocusPanelSummaryDefaultDoc(): LayoutDoc {
    const sections: LayoutSection[] = [];
    SUMMARY_GRID.rows.forEach((row, gridRow) => {
        row.cells.forEach((cell) => {
            sections.push(
                buildFocusPanelCardSection({
                    key: cell.key,
                    span: cell.span,
                    density: cell.density,
                    tier: cell.tier,
                    gridRow,
                }),
            );
        });
    });

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: FOCUS_PANEL_SUMMARY_SURFACE,
        entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
        sections,
        metadata: {
            focusPanelMode: "summary",
            layoutKey: FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
        },
    };
}

/** Stable singleton default doc (the builder is deterministic). */
export const FOCUS_PANEL_SUMMARY_DEFAULT_DOC: LayoutDoc = buildFocusPanelSummaryDefaultDoc();
