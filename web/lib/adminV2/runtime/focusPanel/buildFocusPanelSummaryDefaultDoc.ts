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
import {
    buildPublishedLayoutFromGrid,
    defaultRowSpanForCard,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import type {
    FocusPanelGridLayout,
    FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { withPublishedLayoutMetadata } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc, type LayoutSection } from "@/lib/layout/layoutV2";

/**
 * Default composer grid: Current Work on the left (tall), two stacked cards on the
 * right (Household + Children). Operators can drag/resize from this starting point.
 */
export function focusPanelSummaryDefaultGridLayout(): FocusPanelGridLayout {
    const householdRows = defaultRowSpanForCard("household");
    const childrenRows = defaultRowSpanForCard("children");
    const currentWorkRows = defaultRowSpanForCard("current_work");
    const rightStackRows = householdRows + childrenRows;

    return {
        columns: 12,
        areas: [
            {
                card: "current_work",
                colStart: 1,
                colSpan: 6,
                rowStart: 1,
                rowSpan: Math.max(currentWorkRows, rightStackRows),
            },
            { card: "household", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: householdRows },
            {
                card: "children",
                colStart: 7,
                colSpan: 6,
                rowStart: 1 + householdRows,
                rowSpan: childrenRows,
            },
            {
                card: "readiness_kpi",
                colStart: 1,
                colSpan: 6,
                rowStart: 1 + Math.max(currentWorkRows, rightStackRows),
                rowSpan: defaultRowSpanForCard("readiness_kpi"),
            },
            {
                card: "tour_summary",
                colStart: 7,
                colSpan: 6,
                rowStart: 1 + Math.max(currentWorkRows, rightStackRows),
                rowSpan: defaultRowSpanForCard("tour_summary"),
            },
            {
                card: "communications",
                colStart: 1,
                colSpan: 6,
                rowStart:
                    1
                    + Math.max(currentWorkRows, rightStackRows)
                    + defaultRowSpanForCard("readiness_kpi"),
                rowSpan: defaultRowSpanForCard("communications"),
            },
            {
                card: "documents",
                colStart: 7,
                colSpan: 6,
                rowStart:
                    1
                    + Math.max(currentWorkRows, rightStackRows)
                    + defaultRowSpanForCard("tour_summary"),
                rowSpan: defaultRowSpanForCard("documents"),
            },
        ],
    };
}

/** Default published layout (grid = source of truth for Surface Builder + runtime). */
export function focusPanelSummaryDefaultPublishedLayout(): FocusPanelPublishedLayout {
    return buildPublishedLayoutFromGrid(focusPanelSummaryDefaultGridLayout());
}

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
            ...withPublishedLayoutMetadata(null, focusPanelSummaryDefaultPublishedLayout()),
        },
    };
}

/** Stable singleton default doc (the builder is deterministic). */
export const FOCUS_PANEL_SUMMARY_DEFAULT_DOC: LayoutDoc = buildFocusPanelSummaryDefaultDoc();
