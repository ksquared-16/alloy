import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { CardLifecycle } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    declarationAppliesToGrain,
    filterCardKeysForGrain,
    grainsForDeclaration,
    type CardGrainApplicability,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrainConcern";
import {
    successorForDeclaration,
    type CardSupersession,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardSupersession";
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
export type CardDefinition = CardIdentity &
    Partial<CardLifecycle> &
    Partial<CardGrainApplicability> &
    Partial<CardSupersession>;

/**
 * The declared cards. Each carries only the concern slices it opts into: a reserved-cell `title`
 * (others render their own) and the LIFECYCLE ownership flags (`ownsOperationalTruth` /
 * `ownsWorkCompletion`, read by `focusPanelCoordinationModel`). Ordering is not authoritative here —
 * placement folds in as a later concern.
 */
export const FOCUS_PANEL_CARDS: readonly CardDefinition[] = [
    // Superseded on EVERY grain: the combined Process card answers this question wherever it is
    // asked. The key stays because Current Work remains a canonical data owner.
    {
        key: "current_work",
        title: "What's Next",
        ownsWorkCompletion: true,
        supersededBy: "business_process",
    },
    // The combined Business Process card — successor to `current_work` as a card presentation.
    // Same work-completion ownership, because it is the same operating question at a fuller depth.
    { key: "business_process", title: "What's Next", ownsWorkCompletion: true },
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
     * NOT declared for `household`, deliberately. `buildChildrenCardModel` reads the canonical child
     * collection — on a case, one enrollment's projection of a family's children — while a durable
     * household knows its children through `customer_members`, a wider and differently-shaped set.
     * Declaring the grain without a builder that reads the canonical edge would render enrollment
     * framing for children that have no enrollment. See `deriveHouseholdFocusPanelCards`.
     *
     * ── AND `child`, BECAUSE THIS IS THE CARD THAT ANSWERS "WHO IS THIS CHILD" ──
     *
     * It looked like a roster card and so it was declared case-only, and the durable child record
     * grew a second, smaller card of its own (`child_identity`) to fill the gap. That produced two
     * platform answers to one question: an operator reaching Lennon from a case saw his photo,
     * gender, allergies, medical notes and special instructions with an Edit action, and an operator
     * reaching the same child from Operations saw four fields and no way to change them.
     *
     * The card was never really a roster. Its content is the CHILDREN SURFACE configuration —
     * `children_surface`, resolved by `effectiveChildrenNestedConfig` — which is a child's own field
     * vocabulary, and its focused perspective renders exactly one child. The collection was the
     * container, not the subject.
     *
     * It reaches the child grain honestly because `normalizeFocusPanelChildrenRowsFromTruth` admits
     * `_durable_child_rows`: a durable child composes itself as the one member of its own
     * collection, so the card composes from real truth rather than from a case borrowed for the
     * occasion. `ChildrenCard` reads `context.grain` and opens on that member — see its docblock.
     */
    { key: "children", title: "Children", ownsOperationalTruth: true, grains: ["opportunity", "child"] },
    /**
     * Reads person-owned employment truth; it does not own it, so no lifecycle ownership flag.
     *
     * The FIRST card declared for two grains, and the reason the GRAIN concern exists. Employment is
     * a fact about a PERSON. On a case it is a related-subject projection ("which of my contacts work
     * here"); on a durable Person it is the subject's own answer. Same card, same renderer, same
     * `context.employment` contract — only the producer of that projection differs.
     */
    /**
     * Case-grain ONLY from here on. On a family case this answers "does anyone on this household
     * work here?" — a reference chip, and a different question from "who is this employee?".
     *
     * On a durable PERSON that second question is now owned by `staff`, so the presentation is
     * superseded there and only there. The case chip is untouched, which is exactly why the
     * supersession carries a grain scope instead of being global.
     */
    {
        key: "employment",
        title: "Employment",
        grains: ["opportunity"],
        supersededBy: "staff",
        supersededOnGrains: ["person"],
    },
    /**
     * THE EMPLOYEE-CENTRIC STAFF CARD — person grain only.
     *
     * Successor to the person-grain Employment presentation, reading the SAME
     * `PersonEmploymentComposition`. It is not a second owner of employment truth; it is a fuller
     * presentation of the one owner. Scheduling stays a separate card answering a separate question
     * (when and where are they scheduled), and is deliberately NOT folded in here.
     */
    { key: "staff", title: "Staff", grains: ["person"] },
    /**
     * The first CHILD-grain card, and no longer the child's user-facing one.
     *
     * `children` now reaches this grain (above) and is what a durable child record renders: it is
     * the tenant's CONFIGURED child card, with the fields, labels, order and edit affordance the
     * Children Surface declares. This card composes four hardcoded facts and can be edited nowhere.
     *
     * It is retained as an INTERNAL FALLBACK, not as a presentation choice — a composition that has
     * no published Children Surface at all still resolves something rather than nothing. Do not
     * route a host here to avoid wiring the configured card; that is how the two answers appeared.
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
    /**
     * Truth-owning card with no reserved-cell title (it renders its own).
     *
     * Declared for `child` as well as the case, because a commitment is a fact about the CHILD. The
     * card was always child-shaped inside — it renders per-child assignment rows and executes every
     * canonical assignment action against a `customer_members.id` — and the case grain was only ever
     * the surface that happened to host it.
     *
     * This is the declaration that lets `Operations → Roster → Lennon → Schedule` render the SAME
     * card the case panel renders, rather than a second assignments view. It reaches the child grain
     * as a durable OPERATIONAL context (`canonical_operational`), not through a published
     * composition — there is no `schedule` business process and there must not be one.
     *
     * ── AND `person`, BECAUSE A COMMITMENT IS NOT A CHILD CONCEPT ──
     *
     * `schedule_assignments` was extended in place so children and staff would not acquire competing
     * scheduling engines, and every canonical assignment action already declares `person` among its
     * supported entity types. The card was the only layer still assuming a child, and generalizing
     * it around `OperationalAssignmentSubject` is what makes this third grain honest rather than
     * aspirational: `Roster → Staff → Jane → Schedule` renders THIS card, not a staff copy of it.
     *
     * The grain concern remains the gate. A card reaches the person grain because it is declared
     * here — never because a component decided it could.
     */
    { key: "scheduling", ownsOperationalTruth: true, grains: ["opportunity", "child", "person"] },
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

/**
 * The canonical successor that owns this card's presentation on `grain`, or null.
 *
 * Omit `grain` to ask only about GLOBAL supersession. That asymmetry is deliberate: a caller that
 * cannot state its grain must not receive a grain-scoped answer, or a person-grain rule would be
 * applied to a case placement — the exact defect the scope exists to prevent.
 */
export function cardSuccessor(
    key: FocusPanelCardKey,
    grain?: OperationalSubjectType,
): FocusPanelCardKey | null {
    const definition = CARD_BY_KEY.get(key);
    if (!definition) return null;
    return successorForDeclaration(definition, grain);
}

/** Resolve a key to the card that actually composes on `grain` (itself when not superseded). */
export function resolveCardIdentity(
    key: FocusPanelCardKey,
    grain?: OperationalSubjectType,
): FocusPanelCardKey {
    return cardSuccessor(key, grain) ?? key;
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
