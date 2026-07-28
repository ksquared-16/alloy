import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * THE FOCUS PANEL CARD REGISTRY — the extensibility contract (Runtime V1 Certification, Workstream C/D).
 *
 * The certification target is: adding a new card is "declare one `CardDefinition` entry + one card
 * component", with the runtime composing/rendering/revealing/deferring it automatically — never an edit
 * to central orchestration. Today card knowledge is scattered across ~13 central lists (union type,
 * archetype Record, builder map.set chain, placement grids, renderer if-chain, titles, catalog,
 * coordination Sets, provisioning contract). This registry folds those concerns in ONE AT A TIME, each
 * migration replacing a central list 1:1 and verified against the loads-as-one + warm-<2s guardrails.
 *
 * The proven seed is `COMMIT_CRITICAL_CARD_SPECS` (a `{key, isKnowable, build}` array the commit-critical
 * producer already iterates with no per-card blocks); this registry generalises that shape.
 *
 * MIGRATION LEDGER (concerns folded in so far):
 *   1. title — reserved-cell / display identity (was `FOCUS_PANEL_CARD_TITLES` in OpportunityFocusPanelModeGrid).
 *   (next: archetype · build · defaultPlacement · lifecycle · commitCritical · catalog · render)
 *
 * PLATFORM vs DOMAIN: this registry is a PLATFORM contract (how any surface declares cards). The
 * per-card `build`/data bindings that fold in later stay DOMAIN-owned (opportunity/stage-work), declared
 * through the contract — domain knowledge must not leak back into the kernel/surface-host layers.
 */
export type CardDefinition = {
    key: FocusPanelCardKey;
    /**
     * Display + reserved-cell identity title. A reserved (settling) cell shows this so the committed
     * panel reads as a complete surface, not a blank placeholder. `undefined` = the card carries its own
     * title in its rendered body (matches the prior `Partial<Record>` behaviour).
     */
    title?: string;
};

/**
 * The declared cards. Only cards that need a reserved-cell title carry one (others render their own).
 * Ordering is not authoritative here — placement folds in as a later concern (`defaultPlacement`).
 */
export const FOCUS_PANEL_CARDS: readonly CardDefinition[] = [
    { key: "current_work", title: "What's Next" },
    { key: "household", title: "Household" },
    { key: "children", title: "Children" },
    { key: "readiness_kpi", title: "Readiness" },
    { key: "health", title: "Enrollment Health" },
    { key: "tour_summary", title: "Tour" },
    { key: "communications", title: "Communications" },
    { key: "documents", title: "Documents" },
    { key: "attention", title: "Why Now" },
    { key: "billing_preview", title: "Billing Preview" },
    { key: "required_information", title: "Required Information" },
    { key: "current_mission", title: "Current Mission" },
    { key: "timeline", title: "Timeline" },
    { key: "notes", title: "Notes" },
];

const CARD_BY_KEY: ReadonlyMap<FocusPanelCardKey, CardDefinition> = new Map(
    FOCUS_PANEL_CARDS.map((c) => [c.key, c]),
);

/** The declared definition for a card key, or undefined when the key has no registry entry yet. */
export function cardDefinition(key: FocusPanelCardKey): CardDefinition | undefined {
    return CARD_BY_KEY.get(key);
}

/** The declared reserved-cell / display title for a card, or undefined (card renders its own). */
export function cardTitle(key: FocusPanelCardKey): string | undefined {
    return CARD_BY_KEY.get(key)?.title;
}
