/**
 * Composition Engine V1 — the Focus Panel surface is COMPOSED from card
 * semantics, not laid out as equal grid cells.
 *
 * @see docs/sprints/06_2026/focus-panel-composition-engine-v1
 * @see docs/platform/operator/card-composition-system.md
 *
 * The engine receives:
 *   - a Surface Definition (the ordered cards the surface chose to show)
 *   - each card's Composition Preference (Weight, Preferred Partners, Row, width)
 *   - the available width
 * …and returns a COMPOSITION the renderer can paint: interlocking lanes (heavy
 * anchors beside lighter support, different widths) or a composed stack when the
 * surface is too narrow for lanes. Cards never compose themselves.
 *
 * This is layout DERIVATION (pure, testable). It introduces no runtime behavior,
 * no new primitive, and no new card — it replaces a uniform grid with a
 * semantics-driven composition. Depth (Focus Cards) and inline overlays are
 * unchanged; the engine only decides where cards SIT on the base canvas.
 */

import {
    DEFAULT_CARD_COMPOSITION_PREFERENCE,
    resolveCardCompositionPreference,
    type CardCompositionPreference,
    type CardOperationalWeight,
} from "@/lib/adminV2/runtime/focusPanel/cardCompositionModel";
import type { FocusPanelCardDensity } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/** The composition grid is finer than the legacy 1–4 column grid so cards can
 * claim genuinely DIFFERENT widths (e.g. a 7/12 anchor beside a 5/12 support). */
export const COMPOSITION_COLUMN_BASE = 12;

/** Below this the surface composes as a stack; at/above it, interlocking lanes. */
export const COMPOSITION_LANES_MIN_PX = 560;
/** Below this even the support pair stacks to a single column. */
export const COMPOSITION_PAIR_MIN_PX = 420;

/** A card the surface asked to show, with the type used for preference lookup. */
export type CompositionCardInput = {
    /** Cell/instance key the renderer resolves with `renderCell` + elevation. */
    key: string;
    /** Card TYPE — drives composition preferences (weight, partners, …). */
    typeKey: FocusPanelCardKey;
};

/** One card placed by the engine, with the width (in column units) it claims. */
export type ComposedCardPlacement = {
    key: string;
    typeKey: FocusPanelCardKey;
    /** Width in `COMPOSITION_COLUMN_BASE` units (the card's share of the row). */
    widthUnits: number;
    weight: CardOperationalWeight;
    density: FocusPanelCardDensity;
};

/** A vertical column of cards (heavy anchors vs lighter support) in lane mode. */
export type ComposedLane = {
    role: "primary" | "support";
    /** Lane width in `COMPOSITION_COLUMN_BASE` units (lanes are asymmetric). */
    widthUnits: number;
    cards: ComposedCardPlacement[];
};

export type FocusPanelComposition = {
    /** `lanes` interlocks anchors beside support; `stack` is a composed column. */
    strategy: "lanes" | "stack";
    columnBase: number;
    /** Populated for `strategy: "lanes"`. */
    lanes: ComposedLane[];
    /** Populated for `strategy: "stack"` (rows of side-by-side support cards). */
    stack: ComposedCardPlacement[];
    /** Human-readable decisions — surfaced in the sprint review + dev harness. */
    rationale: string[];
};

export type ComposeInput = {
    cards: CompositionCardInput[];
    availableWidthPx: number;
    /** Surface / Business Process overrides over the platform default prefs. */
    overrides?: Partial<Record<FocusPanelCardKey, Partial<CardCompositionPreference>>>;
};

const WEIGHT_POINTS: Record<CardOperationalWeight, number> = {
    heavy: 3,
    medium: 2,
    light: 1,
};

function weightToDensity(weight: CardOperationalWeight): FocusPanelCardDensity {
    switch (weight) {
        case "heavy":
            return "standard";
        case "medium":
            return "compact";
        case "light":
        default:
            return "micro";
    }
}

type Resolved = {
    input: CompositionCardInput;
    pref: CardCompositionPreference;
};

/** Heavy cards (or explicit lead-row anchors) carry the primary lane. */
function isAnchor(pref: CardCompositionPreference): boolean {
    return pref.weight === "heavy";
}

/**
 * Compose the primary lane's width (in column units) from the weight balance of
 * the two lanes, then clamp so the anchor lane STAYS DOMINANT without starving
 * the support lane. This is what makes the composition read as "one workspace
 * with a lead column" rather than two equal columns.
 */
function resolvePrimaryUnits(primary: Resolved[], support: Resolved[]): number {
    const primaryPoints = primary.reduce((sum, r) => sum + WEIGHT_POINTS[r.pref.weight], 0);
    const supportPoints = support.reduce((sum, r) => sum + WEIGHT_POINTS[r.pref.weight], 0);
    const total = primaryPoints + supportPoints;
    if (total <= 0) return Math.round(COMPOSITION_COLUMN_BASE / 2);
    const raw = Math.round((primaryPoints / total) * COMPOSITION_COLUMN_BASE);
    // Dominant but never crowding. With a SINGLE support card the anchor may take up
    // to 8/12; with a STACKED support lane (2+ cards) cap the anchor at 7/12 so the
    // support lane reads at ≥5/12 (~310px at the live panel width) instead of a
    // cramped 4/12 (~234px). (Enrollment Freeze composition refinement.)
    const cap = support.length > 1 ? 7 : 8;
    return Math.min(cap, Math.max(6, raw));
}

/**
 * Compose the Focus Panel surface from card semantics + available width.
 *
 * Order is preserved within each lane (the Surface Definition still owns reading
 * order); the engine only decides grouping and WIDTH. With no anchors or no
 * support cards the surface composes as a single full-width column (still a
 * composition — just a degenerate one).
 */
export function composeFocusPanelSurface(input: ComposeInput): FocusPanelComposition {
    const resolved: Resolved[] = input.cards.map((card) => ({
        input: card,
        pref: resolveCardCompositionPreference(card.typeKey, input.overrides?.[card.typeKey]),
    }));

    const rationale: string[] = [];
    const primary = resolved.filter((r) => isAnchor(r.pref));
    const support = resolved.filter((r) => !isAnchor(r.pref));

    const canLane =
        input.availableWidthPx >= COMPOSITION_LANES_MIN_PX &&
        primary.length > 0 &&
        support.length > 0;

    if (canLane) {
        const primaryUnits = resolvePrimaryUnits(primary, support);
        const supportUnits = COMPOSITION_COLUMN_BASE - primaryUnits;
        rationale.push(
            `Lanes at ${input.availableWidthPx}px: anchors [${primary
                .map((r) => r.input.typeKey)
                .join(", ")}] claim the ${primaryUnits}/${COMPOSITION_COLUMN_BASE} lead lane; support [${support
                .map((r) => r.input.typeKey)
                .join(", ")}] balances the ${supportUnits}/${COMPOSITION_COLUMN_BASE} lane.`,
        );
        return {
            strategy: "lanes",
            columnBase: COMPOSITION_COLUMN_BASE,
            lanes: [
                {
                    role: "primary",
                    widthUnits: primaryUnits,
                    cards: primary.map((r) =>
                        toPlacement(r, primaryUnits),
                    ),
                },
                {
                    role: "support",
                    widthUnits: supportUnits,
                    cards: support.map((r) => toPlacement(r, supportUnits)),
                },
            ],
            stack: [],
            rationale,
        };
    }

    // Stack composition: anchors take the full row; light/medium support cards
    // PAIR into a sub-row (different rhythm than the heavy cards) so the column
    // still reads as composed — not four identical stacked widgets.
    const pairSupport = input.availableWidthPx >= COMPOSITION_PAIR_MIN_PX && support.length > 1;
    const supportUnits = pairSupport
        ? Math.round(COMPOSITION_COLUMN_BASE / 2)
        : COMPOSITION_COLUMN_BASE;
    rationale.push(
        input.availableWidthPx >= COMPOSITION_LANES_MIN_PX
            ? `Stack at ${input.availableWidthPx}px: not enough anchors+support for lanes.`
            : `Stack at ${input.availableWidthPx}px (< ${COMPOSITION_LANES_MIN_PX}px lanes threshold).`,
    );
    if (pairSupport) {
        rationale.push(
            `Support cards [${support.map((r) => r.input.typeKey).join(", ")}] pair at ${supportUnits}/${COMPOSITION_COLUMN_BASE} beneath the full-width anchors.`,
        );
    }

    const stack: ComposedCardPlacement[] = [
        ...primary.map((r) => toPlacement(r, COMPOSITION_COLUMN_BASE)),
        ...support.map((r) => toPlacement(r, supportUnits)),
    ];

    return {
        strategy: "stack",
        columnBase: COMPOSITION_COLUMN_BASE,
        lanes: [],
        stack,
        rationale,
    };
}

function toPlacement(resolved: Resolved, widthUnits: number): ComposedCardPlacement {
    return {
        key: resolved.input.key,
        typeKey: resolved.input.typeKey,
        widthUnits,
        weight: resolved.pref.weight,
        density: weightToDensity(resolved.pref.weight),
    };
}

/** Flatten a composition to reading order (lanes interleave anchor→support). */
export function compositionReadingOrder(composition: FocusPanelComposition): ComposedCardPlacement[] {
    if (composition.strategy === "stack") return composition.stack;
    return composition.lanes.flatMap((lane) => lane.cards);
}

export const COMPOSITION_DEFAULT_PREFERENCE = DEFAULT_CARD_COMPOSITION_PREFERENCE;
