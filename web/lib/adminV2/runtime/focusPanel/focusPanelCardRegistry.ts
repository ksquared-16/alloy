import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { CardLifecycle } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    declarationAppliesToGrain,
    filterCardKeysForGrain,
    grainsForDeclaration,
    type CardGrainApplicability,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrainConcern";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";

/**
 * THE FOCUS PANEL CARD REGISTRY — the extension model for Alloy surfaces (Runtime V1 Certification,
 * Workstreams C/D/E). This is a PLATFORM CONTRACT, not a switch-statement replacement.
 *
 * TARGET: adding a card is "declare it once + supply its component", and the runtime
 * composes/renders/reveals/defers/measures it automatically — never a central-orchestration edit. Today
 * card knowledge is scattered across ~13 central lists; each is folded in ONE CONCERN AT A TIME, each
 * migration replacing a central list 1:1 and verified against the loads-as-one + warm-<2s guardrails.
 *
 * DESIGN LAW — COMPOSE SMALL CONTRACTS, DO NOT GROW A GOD-SCHEMA:
 *   A `CardDefinition` is the composition of its IDENTITY with the independent CONCERN CONTRACTS it opts
 *   into — placement · lifecycle · loading policy · dependencies · permissions · diagnostics · render.
 *   Each concern is a SMALL, separately-typed contract OWNED BY ITS OWN runtime composer (the placement
 *   composer reads placement; the reveal composer reads loading policy; …). No single coordinator knows
 *   all concerns. Adding a concern = one optional slice + one composer; existing cards are untouched.
 *   Every property added here must satisfy: (1) the runtime needs it; (2) multiple cards use it;
 *   (3) multiple future surfaces use it; (4) it REMOVES orchestration; (5) it introduces NO new central
 *   coordinator. Scale test for every decision: at 300 cards across 40 products, does this get EASIER to
 *   extend, or harder? Optimize for easier.
 *
 * PLATFORM vs DOMAIN: the registry + concern contracts are PLATFORM (how ANY surface declares cards). A
 * card's `build`/data bindings (folded in later) stay DOMAIN-owned (opportunity/stage-work) and are
 * declared THROUGH the contract — domain knowledge never leaks back into the kernel/surface-host layers.
 *
 * MIGRATION LEDGER (concerns folded in so far):
 *   1. IDENTITY.title — reserved-cell / display title (was `FOCUS_PANEL_CARD_TITLES`).
 *   2. LIFECYCLE (`CardLifecycle`, owned by `focusPanelCoordinationModel`) — canvas-elevation
 *      ownership: `ownsOperationalTruth` / `ownsWorkCompletion` (were the `OPERATIONAL_TRUTH_CARDS` /
 *      `WORK_OWNING_CARDS` membership sets). The composers `isOperationalTruthCard` /
 *      `isWorkOwningCard` now read this concern off the registry.
 *   (next, each as its own concern contract + composer: placement · loadingPolicy(+commitCritical) ·
 *    dependencies · permissions · diagnostics · render · archetype · catalog)
 *
 * The proven seed is `COMMIT_CRITICAL_CARD_SPECS` (`{key, isKnowable, build}`, already iterated with no
 * per-card blocks) — it becomes the `loadingPolicy` concern, not a field on a monolith.
 */

/**
 * IDENTITY concern — the one contract every card has. Kept deliberately tiny; other concerns attach as
 * their own optional slices (see the DESIGN LAW above), each defined in its owning module as it migrates.
 */
export type CardIdentity = {
    key: FocusPanelCardKey;
    /**
     * Display + reserved-cell title. A reserved (settling) cell shows this so the committed panel reads
     * as a complete surface, not a blank placeholder. `undefined` = the card renders its own title.
     */
    title?: string;
};

/**
 * A card DECLARATION = its identity composed with the concern contracts it opts into. As concerns
 * migrate, this becomes `CardIdentity & Partial<CardPlacement & CardLoadingPolicy & …>`, where each
 * `CardXxx` is a small contract imported from the module that OWNS that concern's composer. It must
 * never collapse into one flat schema this file defines wholesale.
 */
export type CardDefinition = CardIdentity & Partial<CardLifecycle> & Partial<CardGrainApplicability>;

/**
 * The declared cards. Each carries only the concern slices it opts into: a reserved-cell `title`
 * (others render their own) and the LIFECYCLE ownership flags (`ownsOperationalTruth` /
 * `ownsWorkCompletion`, read by `focusPanelCoordinationModel`). Ordering is not authoritative here —
 * placement folds in as a later concern.
 */
export const FOCUS_PANEL_CARDS: readonly CardDefinition[] = [
    { key: "current_work", title: "What's Next", ownsWorkCompletion: true },
    /**
     * Declared for the durable FAMILY as well as the case — and the declaration is what makes the
     * durable Household surface exist at all. Silence would have left it case-only by the
     * `DEFAULT_CARD_GRAINS` rule, so `deriveHouseholdFocusPanelCards` would compose nothing and the
     * record would open empty. That is the silence rule working, not a bug to route around.
     *
     * It clears the truthfulness bar at both grains for the same reason Employment does:
     * `buildOpportunityFamilyContactRows` already answers "who is this family, and how do we reach
     * them" from `customer_persons` alone, with no case involved. Same card, same renderer, same
     * model builder — only the producer of the record differs.
     */
    { key: "household", title: "Household", ownsOperationalTruth: true, grains: ["opportunity", "household"] },
    /**
     * NOT declared for `household`, deliberately. `buildChildrenCardModel` reads `_inquiry_children`
     * — one enrollment's projection of a family's children — while a durable household knows its
     * children through `customer_members`, a wider and differently-shaped set. Declaring the grain
     * without a builder that reads the canonical edge would render enrollment framing for children
     * that have no enrollment. See `deriveHouseholdFocusPanelCards`.
     */
    { key: "children", title: "Children", ownsOperationalTruth: true },
    /**
     * Reads person-owned employment truth; it does not own it, so no lifecycle ownership flag.
     *
     * The FIRST card declared for two grains, and the reason the GRAIN concern exists. Employment is
     * a fact about a PERSON. On a case it is a related-subject projection ("which of my contacts work
     * here"); on a durable Person it is the subject's own answer. Same card, same renderer, same
     * `context.employment` contract — only the producer of that projection differs.
     */
    { key: "employment", title: "Employment", grains: ["opportunity", "person"] },
    /**
     * The first CHILD-grain card. Declared for `child` ONLY: it is the durable child's own identity,
     * not a family's roster, so it has no meaning on a case panel where `children` already answers
     * "who are this family's children".
     */
    { key: "child_identity", title: "Child", grains: ["child"] },
    { key: "milestones", title: "Milestones" },
    { key: "readiness_kpi", title: "Readiness" },
    { key: "health", title: "Enrollment Health" },
    { key: "tour_summary", title: "Tour" },
    { key: "communications", title: "Communications", ownsOperationalTruth: true },
    { key: "documents", title: "Documents", ownsOperationalTruth: true },
    { key: "attention", title: "Why Now" },
    { key: "billing_preview", title: "Billing Preview", ownsOperationalTruth: true },
    { key: "required_information", title: "Required Information" },
    { key: "current_mission", title: "Current Mission" },
    { key: "timeline", title: "Timeline" },
    { key: "notes", title: "Notes" },
    // Truth-owning card with no reserved-cell title (renders its own): declared for the lifecycle concern.
    { key: "scheduling", ownsOperationalTruth: true },
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

// ── GRAIN concern composer (contract: `focusPanelCardGrainConcern.ts`) ────────────────────────────

/**
 * Can this card compose for this subject grain?
 *
 * Total and deterministic. An unregistered key is not applicable to ANY grain — including `case`:
 * a key the registry has never heard of has no declaration to trust, and admitting it on the default
 * would let an unknown card onto the enrollment panel, which is the opposite of the guarantee.
 */
export function cardAppliesToGrain(key: FocusPanelCardKey, grain: OperationalSubjectType): boolean {
    const definition = CARD_BY_KEY.get(key);
    if (!definition) return false;
    return declarationAppliesToGrain(definition, grain);
}

/** The grains a registered card admits — its declaration, or the case-only default. */
export function cardGrains(key: FocusPanelCardKey): readonly OperationalSubjectType[] {
    const definition = CARD_BY_KEY.get(key);
    return definition ? grainsForDeclaration(definition) : [];
}

/** Every registered card key applicable to `grain`, in registry order. */
export function cardKeysForGrain(grain: OperationalSubjectType): FocusPanelCardKey[] {
    return filterCardKeysForGrain(FOCUS_PANEL_CARDS, grain);
}
