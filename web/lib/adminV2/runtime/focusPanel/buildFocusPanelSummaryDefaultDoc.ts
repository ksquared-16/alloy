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
    focusPanelDefaultCompositionForGrain,
    focusPanelSummaryDefaultGrid,
    focusPanelSummaryGridForGrain,
    type SummaryCompositionContext,
    type SummaryCompositionEntry,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
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
    return encodeCompositionAsDoc(
        FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION,
        focusPanelSummaryDefaultPublishedLayout(),
    );
}

function encodeCompositionAsDoc(
    composition: readonly SummaryCompositionEntry[],
    publishedLayout: FocusPanelPublishedLayout,
): LayoutDoc {
    const sections: LayoutSection[] = composition.map((entry, gridRow) =>
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
        // ⚠ STILL `opportunities`. This is the doc's ADDRESSING key, and `entity_layouts` constrains
        // it (R9: the CHECK allows only `drawer|queue` for `surface`, and the Summary row is keyed by
        // `entity_type="opportunities"`). A code-owned default never touches that table, so a
        // person-grain default composes fine — but a tenant cannot PUBLISH one until the addressing
        // is widened. Recorded in DURABLE-RECORD-ATTENTION.md; deliberately not solved in this slice.
        entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
        sections,
        metadata: {
            focusPanelMode: "summary",
            layoutKey: FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
            ...withPublishedLayoutMetadata(null, publishedLayout),
        },
    };
}

/** Stable singleton default doc — the CASE grain (the tenant-configurable enrollment surface). */
export const FOCUS_PANEL_SUMMARY_DEFAULT_DOC: LayoutDoc = buildFocusPanelSummaryDefaultDoc();

const PERSON_DEFAULT_DOC: LayoutDoc = encodeCompositionAsDoc(
    focusPanelDefaultCompositionForGrain("person"),
    buildPublishedLayoutFromGrid(focusPanelSummaryGridForGrain("person")),
);

const CHILD_DEFAULT_DOC: LayoutDoc = encodeCompositionAsDoc(
    focusPanelDefaultCompositionForGrain("child"),
    buildPublishedLayoutFromGrid(focusPanelSummaryGridForGrain("child")),
);

/**
 * A child selected from an operational lens, where a settled family opportunity is the Record of
 * Truth. Its own singleton, built by the same encoder from its own composition — see
 * `FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION` for why context, not grain, decides this.
 */
const CHILD_WITH_FAMILY_DEFAULT_DOC: LayoutDoc = encodeCompositionAsDoc(
    focusPanelDefaultCompositionForGrain("child", { familySettlement: true }),
    buildPublishedLayoutFromGrid(focusPanelSummaryGridForGrain("child", { familySettlement: true })),
);

/**
 * The code-owned default doc for a subject grain.
 *
 * `opportunity` returns {@link FOCUS_PANEL_SUMMARY_DEFAULT_DOC} — the SAME object reference the case
 * surface has always used, so the enrollment panel is identical, not merely equivalent. Every other
 * grain gets its own singleton, built by the same encoder from its own composition.
 */
export function focusPanelSummaryDefaultDocForGrain(
    grain: OperationalSubjectType,
    context?: SummaryCompositionContext,
): LayoutDoc {
    switch (grain) {
        case "person":
            return PERSON_DEFAULT_DOC;
        case "child":
            return context?.familySettlement ? CHILD_WITH_FAMILY_DEFAULT_DOC : CHILD_DEFAULT_DOC;
        case "opportunity":
            return FOCUS_PANEL_SUMMARY_DEFAULT_DOC;
    }
}
