/**
 * AUTHORING concern — which cards an operator may newly place on a Surface, and in which shapes.
 *
 * ── WHY THIS IS A CONCERN AND NOT A LIST ──
 *
 * The Surface Builder used to offer `FOCUS_PANEL_CARD_CATALOG`: a hand-kept array living beside the
 * registry and agreeing with it only by discipline. It had drifted in every direction at once —
 * it offered `billing_preview` beside Financials as though they were peers, it offered cards under
 * their PREDECESSOR's name, it listed keys with no registered card behind them, and it omitted
 * Staff entirely. An operator authoring from it was picking legacy React components out of a
 * registry rather than laying out an operational workspace.
 *
 * So authorability is derived, not listed. `authorableFocusPanelCards()` reads the SAME registry
 * and the SAME supersession contract the runtime composes from, which is what makes it impossible
 * for the builder and the renderer to disagree about what a card is.
 *
 * ── THE THREE REASONS A CARD IS NOT AUTHORABLE ──
 *
 * SUPERSEDED — a canonical successor now owns its presentation. `current_work` is not offered
 * because `business_process` is what it became. Read from `successorForDeclaration`, never from a
 * second list, so retiring a card is one edit in one place.
 *
 * NOT AN OPERATIONAL CARD HERE — the identity is real and may belong elsewhere in the product, but
 * it is not a peer of the operational cards on this surface. `billing_preview` answers "is billing
 * CONFIGURED?", which is a genuine question and a configuration one; sitting beside Financials in
 * the Focus Panel library it read as a second, competing financial card. It stays fully supported
 * for existing layouts and migration — hidden from new authoring is not removed.
 *
 * UNREGISTERED — a key with no card behind it can be authored and will never render. Nothing is
 * hard-coded here: the check is membership in the registry itself.
 *
 * ── PLACEMENT VARIANTS ARE NOT IDENTITIES ──
 *
 * Financials is ONE canonical card with two supported placements. The builder offers them as two
 * choices because the consequence differs, and stores the same `cardKey` with a different density
 * and span. Inventing `financials_compact` as a second key would have been the easy move and would
 * have put two identities in the registry for one card — the exact duplication the supersession
 * contract exists to prevent.
 *
 * A variant is only declared where the presentation is ACTUALLY implemented. The compact Financials
 * card exists (`FinancialsCompactCard`); nothing here invents a density a component cannot render.
 */

import {
    FOCUS_PANEL_CARDS,
    cardDefinition,
    cardTitle,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { successorForDeclaration } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardSupersession";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    FocusPanelCardDensity,
    FocusPanelCardSpan,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";

/** The authoring slice a card declaration may opt into. */
export type CardAuthoring = {
    /**
     * False withholds the card from NEW authoring while leaving it fully renderable.
     *
     * Absent means authorable: a card has to be deliberately withheld, so adding one to the
     * registry does not silently fail to appear in the builder.
     */
    authorable?: boolean;
    /** Why it is withheld — shown to whoever asks, never invented at the call site. */
    authoringNote?: string;
};

/**
 * Cards that are canonical and renderable but not offered as new Focus Panel placements.
 *
 * Declared here rather than in the registry because this is a SURFACE-AUTHORING judgement, not a
 * property of the card: `billing_preview` is a perfectly good card and may be authorable on a
 * configuration-focused surface later. Keeping the reason beside the key is the point — a bare
 * exclusion list decays into folklore.
 */
const WITHHELD_FROM_AUTHORING: Partial<Record<FocusPanelCardKey, string>> = {
    billing_preview:
        "Answers whether billing is CONFIGURED, which is a configuration question rather than an "
        + "operational one. Beside Financials it read as a second financial card. Existing layouts "
        + "keep rendering it.",
    child_identity:
        "The durable child composes as the one member of its own Children collection; `children` is "
        + "the canonical identity.",
    health:
        "Enrollment Health is a pipeline metric, not the child's health record. Health & Safety is "
        + "the operational health card.",
};

/** One authorable choice in the builder — a card identity plus the shape it is placed in. */
/**
 * The presentations a card genuinely implements, named as the operator reads them.
 *
 * A card with more than one entry is one canonical identity with one read model
 * and more than one PRESENTATION — Financials answers the same question at
 * Summary and at Compact. The list is the authoring vocabulary: "Summary" and
 * "Compact", never "standard", "8/12" or "span 8", which are how the platform
 * places it and not what the operator is choosing.
 */
export function placementVariantsFor(
    key: FocusPanelCardKey,
): ReadonlyArray<{ variantLabel: string; density: FocusPanelCardDensity; columns: number }> {
    return (PLACEMENT_VARIANTS[key] ?? []).map((v) => ({
        variantLabel: v.variantLabel ?? "",
        density: v.density,
        columns: v.columns,
    }));
}

/** The variant a placed card is currently in, matched on its authored density. */
export function currentPlacementVariant(
    key: FocusPanelCardKey,
    density: FocusPanelCardDensity | null | undefined,
): string | null {
    const variants = placementVariantsFor(key);
    if (!variants.length) return null;
    const hit = variants.find((v) => v.density === density);
    return (hit ?? variants[0]!).variantLabel;
}

/**
 * A placeable model for an authorable card the PREVIEW SUBJECT does not produce.
 *
 * The composer's card map comes from a demo opportunity, so it contains models for
 * the cards that opportunity has. Staff is not one of them — the demo subject is a
 * family — and the consequence was silent and bad: the tray offered Staff, the click
 * added it to the grid, the order/grid reconciliation found no model, dropped the
 * entry, and the sync effect removed the card again. The operator saw a chip that
 * did nothing.
 *
 * The registry is the authority on what is AUTHORABLE, so it is also the authority
 * on what can be placed. This supplies the minimum a placement needs — identity,
 * title and the declared placement — for exactly those cards the subject cannot
 * model. It is never used where a real model exists, and it is authoring-only: a
 * runtime panel composes from real card models or composes nothing.
 */
export function authoringPlacementModelFor(
    key: FocusPanelCardKey,
): { key: FocusPanelCardKey; title: string; span: FocusPanelCardSpan; density: FocusPanelCardDensity } | null {
    const option = authorableFocusPanelCards().find((o) => o.cardKey === key);
    if (!option) return null;
    return { key, title: option.label, span: option.span, density: option.density };
}

export type AuthorableCardOption = {
    cardKey: FocusPanelCardKey;
    /** The card's CURRENT product name. Never a predecessor's. */
    label: string;
    /** Present only when the card offers more than one supported placement. */
    variantLabel?: string;
    density: FocusPanelCardDensity;
    span: FocusPanelCardSpan;
    /** Columns of the 12-track grid this placement occupies, for the builder's own copy. */
    columns: number;
};

/**
 * Placement variants, for the cards that genuinely have more than one implemented presentation.
 *
 * A card absent from this map is offered once, at its standard placement. Nothing is invented: each
 * entry names a density a real component renders.
 */
const PLACEMENT_VARIANTS: Partial<Record<FocusPanelCardKey, readonly Omit<AuthorableCardOption, "cardKey" | "label">[]>> =
    {
        financials: [
            {
                variantLabel: "Summary",
                density: "standard",
                span: 1,
                columns: 8,
            },
            {
                variantLabel: "Compact",
                density: "compact",
                span: 1,
                columns: 4,
            },
        ],
    };

/**
 * The standard placement for a card with no declared variants.
 *
 * Every authorable card states a width, because the fallback is what produced the packing bug: an
 * unlisted card fell back to six columns, so Readiness dropped beside an 8/12 Financials could not
 * fit (8 + 6 > 12) and took its own row — which reads as the builder refusing to pack when the real
 * cause was a width nobody had declared.
 *
 * These are the widths the runtime compositions actually use, so a card authored at its default
 * lands where the shipped panels put it.
 */
const DEFAULT_COLUMNS: Partial<Record<FocusPanelCardKey, number>> = {
    business_process: 12,
    attendance: 8,
    children: 6,
    staff: 6,
    scheduling: 4,
    household: 4,
    health_safety: 4,
    readiness_kpi: 4,
    tour_summary: 4,
    documents: 4,
    attention: 4,
    required_information: 4,
    notes: 4,
    communications: 6,
    current_mission: 6,
    timeline: 6,
    milestones: 4,
    employment: 6,
};

/**
 * Is this card offered for NEW authoring?
 *
 * Total and derived. A caller never needs a second opinion, and there is nowhere else to encode one.
 */
export function isAuthorableCard(key: FocusPanelCardKey): boolean {
    const declaration = cardDefinition(key);
    // Unregistered: authoring it would place a card that can never render.
    if (!declaration) return false;
    // Superseded globally: the successor is what an operator means.
    if (successorForDeclaration(declaration)) return false;
    if (key in WITHHELD_FROM_AUTHORING) return false;
    return declaration.authorable !== false;
}

/** Why a card is not authorable, for the builder's own explanation. Null when it is. */
export function authoringWithholdingReason(key: FocusPanelCardKey): string | null {
    const declaration = cardDefinition(key);
    if (!declaration) return "No card is registered under this key.";
    const successor = successorForDeclaration(declaration);
    if (successor) return `Superseded by ${cardTitle(successor) ?? successor}.`;
    return WITHHELD_FROM_AUTHORING[key] ?? declaration.authoringNote ?? null;
}

/**
 * THE AUTHORABLE LIBRARY — every current card, in every placement it actually supports.
 *
 * Derived from the registry in registry order, so a card added there appears here without anyone
 * remembering to add it, and a card superseded there disappears from authoring in the same edit.
 */
export function authorableFocusPanelCards(): readonly AuthorableCardOption[] {
    const options: AuthorableCardOption[] = [];
    for (const declaration of FOCUS_PANEL_CARDS) {
        const key = declaration.key;
        if (!isAuthorableCard(key)) continue;
        // The card's own title is its CURRENT product name; the builder never renames a card.
        const label = cardTitle(key) ?? key;
        const variants = PLACEMENT_VARIANTS[key];
        if (variants?.length) {
            for (const v of variants) options.push({ cardKey: key, label, ...v });
            continue;
        }
        options.push({
            cardKey: key,
            label,
            density: "standard",
            span: 1,
            columns: DEFAULT_COLUMNS[key] ?? 6,
        });
    }
    return options;
}
