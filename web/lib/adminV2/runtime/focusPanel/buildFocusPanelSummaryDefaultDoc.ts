/**
 * Code-built default `LayoutDoc` for the Enrollment Focus Panel Summary.
 *
 * This module is a pure ENCODER. It holds no composition of its own — the single code-owned
 * surface composition lives in `composition/focusPanelSummaryDefaultComposition.ts`, and both the
 * doc sections and the rendered 12-column layout are generated from it. An org's published doc
 * overrides this wholesale; it is never merged.
 *
 * Enrollment default composition (visibility model):
 *   Visible — What's Next, Household, Children, Assignments, Billing Preview
 *   Linked  — Tour, Communications, Milestones
 *
 * Linked cards are fully configured sections but omitted from the published grid so they do not
 * consume initial Focus Panel space.
 */

import {
    buildFocusPanelCardSection,
    FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
    FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
    FOCUS_PANEL_SUMMARY_SURFACE,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import { buildPublishedLayoutFromGrid } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import type {
    FocusPanelGridLayout,
    FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { withPublishedLayoutMetadata } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import {
    FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION,
    focusPanelSummaryDefaultGrid,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc, type LayoutSection } from "@/lib/layout/layoutV2";

/**
 * Default composer grid — Visible cards only, generated from the surface composition.
 * What's Next left (tall); Household + Children right stack; Assignments + Billing Preview below.
 */
export function focusPanelSummaryDefaultGridLayout(): FocusPanelGridLayout {
    return focusPanelSummaryDefaultGrid();
}

/** Default published layout (grid = source of truth for Surface Builder + runtime). */
export function focusPanelSummaryDefaultPublishedLayout(): FocusPanelPublishedLayout {
    return buildPublishedLayoutFromGrid(focusPanelSummaryDefaultGridLayout());
}

/**
 * Build the default Focus Panel Summary doc (Visible + Linked sections).
 *
 * Reading order is the composition's array order, encoded as each section's `gridRow`.
 * `span`/`density` come from the composition's `encodedSpan`/`encodedDensity`: schema-required by
 * `readFocusPanelCardSectionMeta`, render-inert, preserved verbatim for compatibility.
 */
export function buildFocusPanelSummaryDefaultDoc(): LayoutDoc {
    const sections: LayoutSection[] = FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.map((entry, gridRow) =>
        buildFocusPanelCardSection({
            key: entry.key,
            span: entry.encodedSpan,
            density: entry.encodedDensity,
            tier: entry.tier,
            gridRow,
            visibility: entry.visibility,
        }),
    );

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
