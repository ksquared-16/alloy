/**
 * THE code-owned Focus Panel Summary default composition — one surface authority.
 *
 * This is the single place the platform declares "what the Enrollment Summary looks like when
 * the org has published nothing". Everything downstream is GENERATED from it:
 *
 *     composition ──▶ FOCUS_PANEL_SUMMARY_DEFAULT_DOC   (sections, reading order, visibility)
 *                 └─▶ metadata.focusPanelLayout          (the 12-column grid the runtime renders)
 *
 * A tenant-published `LayoutDoc` OVERRIDES this wholesale; it is never merged with it. See
 * `usePublishedFocusPanelSummaryDoc` (client) / `workUnitProvisioningAnswer` (server seed).
 *
 * ── Vocabulary ────────────────────────────────────────────────────────────────────────────
 * Placement is authored in the **12-column area** vocabulary (`colStart/colSpan/rowStart/rowSpan`)
 * because that is the ONE vocabulary that actually renders: the Summary composer authors it, it is
 * persisted as `metadata.focusPanelLayout`, and `planPublishedLayout` turns it into the published
 * lanes the operator sees. The area numbers below are surface-owned literals — they were the values
 * this surface already computed, now stated directly instead of derived through a card-keyed table.
 *
 * ── `encodedSpan` / `encodedDensity` are NOT placement authority ──────────────────────────
 * `readFocusPanelCardSectionMeta` rejects a section that lacks `span`/`density`, so every encoded
 * section must carry them and every persisted doc already does. They are **render-inert**: the
 * published path plans from grid areas, the composition path derives density from composition
 * weight, and the legacy grid path is unreachable for Summary. They are preserved here verbatim at
 * the encode/schema boundary for compatibility (stored docs, validators, the editor round-trip) and
 * carry no authority. Removing them is a schema migration, not a placement change.
 *
 * The card-owned placement capability layer remains intentionally empty: no card property has been
 * shown to travel across surfaces (Summary and Work place disjoint card sets). See
 * `docs/runtime/CARD-PLACEMENT-OWNERSHIP.md`.
 */

import type { FocusPanelCardKey, FocusPanelCardTier } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import type { FocusPanelCardDensity, FocusPanelCardSpan } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import {
    FOCUS_PANEL_GRID_COLUMNS,
    type FocusPanelGridArea,
    type FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/** Where a card sits on the 12-column surface. Omitted for Linked cards (no initial geometry). */
export type SummaryCompositionArea = Pick<FocusPanelGridArea, "colStart" | "colSpan" | "rowStart" | "rowSpan">;

export type SummaryCompositionEntry = {
    key: FocusPanelCardKey;
    tier: FocusPanelCardTier;
    /** Visible cards occupy initial geometry; Linked cards stay navigable-only. */
    visibility: "visible" | "linked";
    /** 12-column placement. Present for Visible cards only. */
    area?: SummaryCompositionArea;
    /** Schema-required, render-inert. See module docblock. */
    encodedSpan: FocusPanelCardSpan;
    /** Schema-required, render-inert. See module docblock. */
    encodedDensity: FocusPanelCardDensity;
};

/**
 * Reading order is ARRAY ORDER (encoded as each section's `gridRow`).
 *
 * Layout: What's Next holds the left column full height; Household then Children stack in the right
 * column; Assignments and Billing Preview close the surface on a shared bottom row.
 */
export const FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION: readonly SummaryCompositionEntry[] = [
    {
        key: "current_work",
        tier: "work",
        visibility: "visible",
        area: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 7 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        key: "household",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        key: "children",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 7, colSpan: 6, rowStart: 4, rowSpan: 4 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        key: "scheduling",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    {
        key: "billing_preview",
        tier: "context",
        visibility: "visible",
        area: { colStart: 7, colSpan: 6, rowStart: 8, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    {
        // Employment closes the surface on its own row. Placed VISIBLE rather than Linked because
        // a Linked card is navigable but never rendered — `linkedCardKeys` feeds `focusTargets`
        // only — and an operator arriving from a staff gesture must SEE the answer, not merely be
        // able to hand off to it. For a family with no employed contact the card model reports
        // `visible: false`, which the readiness contract turns into `not_applicable`: the cell is
        // kept and renders its muted treatment rather than asserting a relationship.
        key: "employment",
        tier: "reference",
        visibility: "visible",
        // ⚠ SIX columns in the right-hand reference lane, not a full-width row. A card spanning all
        // 12 columns cannot be planned into lanes, so `planPublishedLayout` fell back from `lanes`
        // to `grid` for the WHOLE panel — every other card's placement changed with it. Employment
        // sits under Billing Preview, beside the other reference cards.
        area: { colStart: 7, colSpan: 6, rowStart: 10, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    { key: "tour_summary", tier: "context", visibility: "linked", encodedSpan: 1, encodedDensity: "compact" },
    { key: "communications", tier: "reference", visibility: "linked", encodedSpan: 1, encodedDensity: "standard" },
    { key: "milestones", tier: "context", visibility: "linked", encodedSpan: 1, encodedDensity: "compact" },
];

/**
 * PERSON-grain default composition — a durable person record.
 *
 * Deliberately ONE card. Employment is the only card with canonical Person truth today, and a sparse
 * truthful panel is the correct V1: copying case cards across for visual completeness would put
 * `current_work`, `household` or `children` on a staff member who has no case, no household and no
 * children — cards that would render empty shells asserting relationships that do not exist.
 *
 * Growing this list is a per-card decision that must be earned twice: the card declares the `person`
 * grain in the registry (it has canonical Person truth), AND it is placed here (it belongs on the
 * default surface). Either without the other is inert, which is the intended friction.
 */
export const FOCUS_PANEL_SUMMARY_PERSON_COMPOSITION: readonly SummaryCompositionEntry[] = [
    {
        key: "employment",
        tier: "reference",
        visibility: "visible",
        // Six columns in the left lane. A 12-column card cannot be planned into lanes and forces
        // `planPublishedLayout` to fall back from `lanes` to `grid` for the whole panel — the same
        // trap documented on the case composition's Employment entry.
        area: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
];

/**
 * CHILD-grain default composition — the durable child's own identity.
 *
 * One card, for the same reason Person has one: `child_identity` is the only card with canonical
 * Child truth that does not require an enrollment. The case-grain `children` card is deliberately
 * absent — it is a family's ROSTER, and placing it here would make a child's own record display a
 * list containing itself.
 *
 * Program / room / schedule / readiness are enrollment-scoped and belong to operational-context
 * enrichment (Workstream E), not to identity.
 */
export const FOCUS_PANEL_SUMMARY_CHILD_COMPOSITION: readonly SummaryCompositionEntry[] = [
    {
        key: "child_identity",
        tier: "reference",
        visibility: "visible",
        // Six columns in the left lane — a 12-column card forces `planPublishedLayout` to fall back
        // from `lanes` to `grid`, the trap documented on the case composition's Employment entry.
        area: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
];

/**
 * CHILD ATTENTION WITH FAMILY SETTLEMENT — a child selected from an operational lens.
 *
 * The distinction this composition exists for is **context, not grain**. Two subjects are both
 * `child`, and they are not the same situation:
 *
 *   durable child                 opened subject-first, no Opportunity, no lens. Nothing family-
 *                                 scoped is authoritative, so the sparse composition above is right.
 *   child attention + settlement  selected from an Enrollment lens. `overlayChildMissionOntoSettled-
 *                                 FocusModel` states the contract: "Record of Attention = child.
 *                                 Record of Truth / Settlement = family opportunity." The family
 *                                 opportunity IS settled and its card models ARE authoritative.
 *
 * So this composition reuses the settled family VM's own card models rather than re-deriving them,
 * and the overlay scopes What's Next to the focused child's Mission. Nothing here widens
 * `cardAppliesToGrain`: that predicate gates the DURABLE derivations, and widening it would hand
 * family cards to a standalone child, a staff member or a person — the failure the grain guard
 * exists to prevent.
 *
 * Card-by-card, why each earns its place for a child seen through a family lens:
 *
 *   current_work     the focused child's Waitlist/stage Mission — the overlay already replaces the
 *                    family's Current Work with it, and it carries the certified command grammar
 *                    (Message / Send form / Tour), so Tour, Forms and Communications arrive with it.
 *   (no child_identity) the focused child is already stated TWICE — the Focus Panel header carries
 *                    "Lennon Kurzman · Waitlist · North Campus", and the Children card names him,
 *                    marks him active and holds his DOB, program and context. A standalone identity
 *                    card would be a third place presenting the same facts, and a second product
 *                    surface for a child the runtime already identifies. It belongs to the DURABLE
 *                    composition, where there is no header subject and no Children card to carry it.
 *   children         kept, with the focused child active; siblings are supporting context. A child
 *                    subject is a reason to scope this card, never to remove it.
 *   household        family/relationship context, and honestly family-scoped — it does not claim to
 *                    be child-owned.
 *   billing_preview  family-scoped contextual information, placed last and compact precisely
 *                    because it is not child-owned. Its priority differs from Current Work.
 *
 * Layout mirrors the case surface exactly: What's Next holds the left column full height; Household
 * then Children stack on the right; Assignments and Billing Preview close on a shared bottom row. No card spans all 12
 * columns — that forces `planPublishedLayout` from `lanes` to `grid` for the whole panel.
 */
export const FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION: readonly SummaryCompositionEntry[] = [
    {
        key: "current_work",
        tier: "work",
        visibility: "visible",
        area: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 7 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        key: "household",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        key: "children",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 7, colSpan: 6, rowStart: 4, rowSpan: 4 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        // Assignments. Placement IS child-scoped, and this card is also the DESTINATION the
        // Children card's placement field links resolve to — `DEFAULT_LINK_DESTINATIONS` maps
        // `inquiry_child.program` / schedule / start_date to `scheduling`. Omitting it left the
        // Assignment affordance rendering but inert: `navigateIdentityFieldLink` refuses a card
        // absent from `focusTargets` and returns `destination_unavailable`, silently.
        key: "scheduling",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    {
        key: "billing_preview",
        tier: "context",
        visibility: "visible",
        area: { colStart: 7, colSpan: 6, rowStart: 8, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    { key: "tour_summary", tier: "context", visibility: "linked", encodedSpan: 1, encodedDensity: "compact" },
    { key: "communications", tier: "reference", visibility: "linked", encodedSpan: 1, encodedDensity: "standard" },
    { key: "milestones", tier: "context", visibility: "linked", encodedSpan: 1, encodedDensity: "compact" },
];

/**
 * The durable FAMILY's composition — the Household card, on its own.
 *
 * Same six-column left lane as the child, for the same recorded reason: a 12-column card forces
 * `planPublishedLayout` to fall back from `lanes` to `grid`.
 *
 * ── THIS ARM IS WHY THE CARD WAS ONCE INVISIBLE ──
 *
 * Widening `OperationalSubjectType` without adding an arm to the switch below left it NON-EXHAUSTIVE,
 * so it returned `undefined` and the surface composed a grid with no areas: the model carried a ready
 * Household card and the panel rendered nothing, with no error. That is a TYPE error and CI would
 * have caught it — `npm run typecheck` cannot run on this host, and the browser found it first.
 *
 * ── AND WHY IT IS DISTINCT FROM THE TWO CHILD COMPOSITIONS ABOVE ──
 *
 * A durable family is not a child seen through its family, and it is not a case. It is the household
 * as its own record: one card, family-owned, with nothing borrowed from an enrollment it may not
 * have. `familySettlement` above answers "is a settled family the Record of Truth BEHIND this
 * child"; this arm answers "the family IS the record", which is a different question with a
 * different subject.
 */
export const FOCUS_PANEL_SUMMARY_HOUSEHOLD_COMPOSITION: readonly SummaryCompositionEntry[] = [
    {
        key: "household",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
];

/**
 * Where the subject is, not merely what it is.
 *
 * `familySettlement` says a settled family opportunity is the Record of Truth behind this subject.
 * It is the difference between the two child situations above, and it is deliberately NOT a grain:
 * making it one would have re-litigated `cardAppliesToGrain` and leaked family cards to every child.
 */
export type SummaryCompositionContext = {
    /** A settled family opportunity backs this subject (lens path), rather than subject-first. */
    familySettlement?: boolean;
};

/**
 * The default composition for a subject grain, in its context.
 *
 * `opportunity` returns the case composition BY REFERENCE — the same array object, not a copy — so
 * the existing enrollment surface is not merely equivalent but identical, and no regression can hide
 * in a re-derivation. `person` never consults context: a staff member has no family settlement to
 * have, and answering otherwise is exactly how household/children would land on a staff record.
 */
export function focusPanelDefaultCompositionForGrain(
    grain: OperationalSubjectType,
    context?: SummaryCompositionContext,
): readonly SummaryCompositionEntry[] {
    switch (grain) {
        case "person":
            return FOCUS_PANEL_SUMMARY_PERSON_COMPOSITION;
        case "child":
            return context?.familySettlement
                ? FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION
                : FOCUS_PANEL_SUMMARY_CHILD_COMPOSITION;
        case "household":
            /*
             * The family as its own record. It never consults `context` for the same reason `person`
             * does not: a household IS the family, so "a settled family backs this subject" is not a
             * distinction it can draw about itself.
             */
            return FOCUS_PANEL_SUMMARY_HOUSEHOLD_COMPOSITION;
        case "opportunity":
            return FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION;
    }
}

/** The 12-column grid the runtime renders — generated from a composition (Visible cards only). */
function gridFromComposition(composition: readonly SummaryCompositionEntry[]): FocusPanelGridLayout {
    const areas: FocusPanelGridArea[] = composition.flatMap((entry) =>
        entry.area ? [{ card: entry.key, ...entry.area }] : [],
    );
    return { columns: FOCUS_PANEL_GRID_COLUMNS, areas };
}

/** The 12-column grid the runtime renders — generated from the composition (Visible cards only). */
export function focusPanelSummaryDefaultGrid(): FocusPanelGridLayout {
    return gridFromComposition(FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION);
}

/** The 12-column grid for a subject grain's default composition. */
export function focusPanelSummaryGridForGrain(
    grain: OperationalSubjectType,
    context?: SummaryCompositionContext,
): FocusPanelGridLayout {
    return gridFromComposition(focusPanelDefaultCompositionForGrain(grain, context));
}
