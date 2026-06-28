/**
 * Card Composition Model — the declarative layer between cards and the
 * Experience Builder. @see docs/platform/operator/card-composition-system.md
 *
 * Cards declare *composition preferences* (recommendations). A future layout
 * engine consumes Surface Definition + these preferences + available width to
 * balance one operational experience. THIS MODULE IS DECLARATIVE AND UNWIRED:
 * it introduces no runtime behavior and no new architecture. It exists so the
 * composition system is concrete and testable before the engine is built.
 *
 * Two orthogonal inputs (do not conflate):
 *   - Tier (card-language.md): how soon the operator must engage → reading ORDER.
 *   - Composition Weight (here): how much area/emphasis a card needs → SIZE.
 * A card's footprint (width) is DERIVED from weight + width constraints.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardFootprint } from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";

/** Visual emphasis & default area — NOT pixels, NOT the priority tier. */
export type CardOperationalWeight = "heavy" | "medium" | "light";

/** The band of the surface a card gravitates to (maps to tier intent). */
export type CardPreferredRow = "lead" | "support" | "context" | "footer";

/** How a card grows on Perspective Change (local UI, never a Subject Change). */
export type CardPerspectiveExpansion = "in_place" | "takeover_row" | "takeover_surface";

export type CardPreferredHeight = "compact" | "standard" | "tall" | "auto";

/** Column width budget (in responsive grid columns); "full" = whole row. */
export type CardWidth = number | "full";

/** A card's composition preferences — recommendations to the layout engine. */
export type CardCompositionPreference = {
    weight: CardOperationalWeight;
    /** Cards this reads well beside, highest-affinity first. */
    preferredPartners: FocusPanelCardKey[];
    preferredRow: CardPreferredRow;
    /** Fewest columns the card can function in. */
    minWidth: number;
    /** Most columns it should occupy ("full" = claim the row). */
    maxWidth: CardWidth;
    preferredHeight: CardPreferredHeight;
    perspectiveExpansion: CardPerspectiveExpansion;
};

/**
 * Platform default preferences. A Surface Definition / Business Process may
 * override any field — these are not hardcoded layouts, they are starting points.
 */
export const CARD_COMPOSITION_PREFERENCES: Partial<
    Record<FocusPanelCardKey, CardCompositionPreference>
> = {
    household: {
        weight: "heavy",
        preferredPartners: ["children", "communications"],
        preferredRow: "lead",
        minWidth: 2,
        maxWidth: "full",
        preferredHeight: "tall",
        perspectiveExpansion: "takeover_row",
    },
    children: {
        weight: "heavy",
        preferredPartners: ["household", "readiness_kpi", "current_work"],
        preferredRow: "lead",
        minWidth: 2,
        maxWidth: "full",
        preferredHeight: "tall",
        perspectiveExpansion: "takeover_row",
    },
    communications: {
        weight: "heavy",
        preferredPartners: ["household", "timeline"],
        preferredRow: "context",
        minWidth: 2,
        maxWidth: "full",
        preferredHeight: "tall",
        perspectiveExpansion: "takeover_row",
    },
    timeline: {
        weight: "heavy",
        preferredPartners: ["communications"],
        preferredRow: "footer",
        minWidth: 2,
        maxWidth: "full",
        preferredHeight: "tall",
        perspectiveExpansion: "takeover_surface",
    },
    readiness_kpi: {
        weight: "medium",
        preferredPartners: ["children", "attention"],
        preferredRow: "support",
        minWidth: 1,
        maxWidth: 2,
        preferredHeight: "standard",
        perspectiveExpansion: "in_place",
    },
    health: {
        weight: "medium",
        preferredPartners: ["readiness_kpi"],
        preferredRow: "support",
        minWidth: 1,
        maxWidth: 2,
        preferredHeight: "standard",
        perspectiveExpansion: "in_place",
    },
    documents: {
        weight: "medium",
        preferredPartners: ["communications"],
        preferredRow: "context",
        minWidth: 1,
        maxWidth: 2,
        preferredHeight: "standard",
        perspectiveExpansion: "in_place",
    },
    current_work: {
        weight: "light",
        preferredPartners: ["tour_summary", "readiness_kpi", "attention"],
        preferredRow: "lead",
        minWidth: 1,
        maxWidth: 1,
        preferredHeight: "compact",
        perspectiveExpansion: "in_place",
    },
    tour_summary: {
        weight: "light",
        preferredPartners: ["current_work"],
        preferredRow: "support",
        minWidth: 1,
        maxWidth: 1,
        preferredHeight: "compact",
        perspectiveExpansion: "in_place",
    },
    attention: {
        weight: "light",
        preferredPartners: ["current_work", "readiness_kpi"],
        preferredRow: "lead",
        minWidth: 1,
        maxWidth: 1,
        preferredHeight: "compact",
        perspectiveExpansion: "in_place",
    },
};

/** Conservative default for any card without an explicit preference. */
export const DEFAULT_CARD_COMPOSITION_PREFERENCE: CardCompositionPreference = {
    weight: "medium",
    preferredPartners: [],
    preferredRow: "support",
    minWidth: 1,
    maxWidth: 2,
    preferredHeight: "standard",
    perspectiveExpansion: "in_place",
};

/**
 * Resolve a card's effective preferences: platform default ⊕ Surface/Process
 * override. (The override is a partial — only declared fields win.)
 */
export function resolveCardCompositionPreference(
    key: FocusPanelCardKey,
    override?: Partial<CardCompositionPreference> | null,
): CardCompositionPreference {
    const base = CARD_COMPOSITION_PREFERENCES[key] ?? DEFAULT_CARD_COMPOSITION_PREFERENCE;
    if (!override) return base;
    return { ...base, ...override };
}

/** Weight → its default footprint (the width expression of emphasis). */
export function weightToDefaultFootprint(
    weight: CardOperationalWeight,
): FocusPanelCardFootprint {
    switch (weight) {
        case "heavy":
            return "wide";
        case "medium":
            return "medium";
        case "light":
        default:
            return "narrow";
    }
}

/**
 * Weight → the density a card should render at when the surface collapses to a
 * single column. Anchors stay Standard so the stack keeps visible rhythm;
 * companions render Compact. @see card-composition-system.md §8.
 */
export function weightToStackDensity(
    weight: CardOperationalWeight,
): "standard" | "compact" {
    return weight === "heavy" ? "standard" : "compact";
}

/** True when two cards mutually prefer each other (engine row-affinity hint). */
export function arePreferredPartners(
    a: FocusPanelCardKey,
    b: FocusPanelCardKey,
): boolean {
    const prefA = CARD_COMPOSITION_PREFERENCES[a]?.preferredPartners ?? [];
    const prefB = CARD_COMPOSITION_PREFERENCES[b]?.preferredPartners ?? [];
    return prefA.includes(b) || prefB.includes(a);
}
