/**
 * Code-built default `LayoutDoc` for the Enrollment Focus Panel Summary.
 *
 * Enrollment default composition (visibility model):
 *   Visible — What's Next, Household, Children, Billing Preview
 *   Linked  — Scheduling, Tour, Communications, Milestones
 *
 * Linked cards are fully configured sections but omitted from the published grid
 * so they do not consume initial Focus Panel space.
 */

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
import {
    ENROLLMENT_DEFAULT_LINKED_CARD_KEYS,
    ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";
import type { FocusPanelCardKey, FocusPanelCardTier } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardDensity, FocusPanelCardSpan } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc, type LayoutSection } from "@/lib/layout/layoutV2";

type DefaultCardSeed = {
    key: FocusPanelCardKey;
    span: FocusPanelCardSpan;
    density: FocusPanelCardDensity;
    tier: FocusPanelCardTier;
    visibility: "visible" | "linked";
};

const DEFAULT_CARD_SEEDS: readonly DefaultCardSeed[] = [
    { key: "current_work", span: 1, density: "standard", tier: "work", visibility: "visible" },
    { key: "household", span: 1, density: "standard", tier: "reference", visibility: "visible" },
    { key: "children", span: 1, density: "standard", tier: "reference", visibility: "visible" },
    { key: "billing_preview", span: 1, density: "compact", tier: "context", visibility: "visible" },
    { key: "scheduling", span: 1, density: "compact", tier: "reference", visibility: "linked" },
    { key: "tour_summary", span: 1, density: "compact", tier: "context", visibility: "linked" },
    { key: "communications", span: 1, density: "standard", tier: "reference", visibility: "linked" },
    { key: "milestones", span: 1, density: "compact", tier: "context", visibility: "linked" },
];

/**
 * Default composer grid — Visible cards only.
 * What's Next left (tall); Household + Children right stack; Billing Preview below.
 */
export function focusPanelSummaryDefaultGridLayout(): FocusPanelGridLayout {
    const householdRows = defaultRowSpanForCard("household");
    const childrenRows = defaultRowSpanForCard("children");
    const currentWorkRows = defaultRowSpanForCard("current_work");
    const billingRows = defaultRowSpanForCard("billing_preview");
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
                card: "billing_preview",
                colStart: 1,
                colSpan: 12,
                rowStart: 1 + Math.max(currentWorkRows, rightStackRows),
                rowSpan: billingRows,
            },
        ],
    };
}

/** Default published layout (grid = source of truth for Surface Builder + runtime). */
export function focusPanelSummaryDefaultPublishedLayout(): FocusPanelPublishedLayout {
    return buildPublishedLayoutFromGrid(focusPanelSummaryDefaultGridLayout());
}

/** Build the default Focus Panel Summary doc (Visible + Linked sections). */
export function buildFocusPanelSummaryDefaultDoc(): LayoutDoc {
    const sections: LayoutSection[] = DEFAULT_CARD_SEEDS.map((seed, gridRow) =>
        buildFocusPanelCardSection({
            key: seed.key,
            span: seed.span,
            density: seed.density,
            tier: seed.tier,
            gridRow,
            visibility: seed.visibility,
        }),
    );

    // Sanity: default seeds match the enrollment visibility lists.
    void ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS;
    void ENROLLMENT_DEFAULT_LINKED_CARD_KEYS;

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
