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
    {
        key: "attendance",
        tier: "work",
        visibility: "visible",
        // A full row of its own beneath the family cards: the day reads left to right, and sharing a
        // lane would force the movement sequence to wrap.
        area: { colStart: 1, colSpan: 12, rowStart: 8, rowSpan: 2 },
        encodedSpan: "row",
        encodedDensity: "compact",
    },
    {
        /*
         * FINANCIALS AS SUPPORTING CONTEXT — the COMPACT density, deliberately.
         *
         * A family case panel is an acquisition/enrollment process, and money is context inside it
         * rather than its subject: what is owed and whether anything is overdue, with the way in. The
         * full period breakdown belongs to the child panel's V5 summary, where the account IS the
         * subject. Attempting the reconciliation here would spend half a case panel on a half-stated
         * total, which is more misleading than a balance and a link.
         */
        key: "financials",
        tier: "context",
        visibility: "visible",
        area: { colStart: 1, colSpan: 6, rowStart: 12, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
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
        // `staff`, not `employment`: on a durable person the Employment presentation is superseded
        // (registry SUPERSESSION concern, person grain only), and `employment` no longer declares
        // this grain — so naming it here would place a card the grain gate then refuses.
        key: "staff",
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
 * One card, for the same reason Person has one: it is the only card with canonical Child truth that
 * does not require an enrollment. That card is `children`, the tenant's CONFIGURED child card — the
 * same one the case panel renders — and it belongs here because it was never really a roster: its
 * content is a child's own field vocabulary and its focused perspective renders exactly one child.
 *
 * The worry that placing it here would make a child's record display a list containing itself is
 * answered structurally rather than by avoiding the card: on a `child` grain the collection holds
 * exactly one member and it is the subject, and `ChildrenCard` reads the grain and opens on that
 * member. `child_identity` — four hardcoded, uneditable facts — was the workaround, and it left the
 * platform with two answers to "who is this child" depending on how the operator arrived.
 *
 * Program / room / schedule / readiness are enrollment-scoped: the configured card renders those
 * rows unset here rather than fabricating a participation the record does not have.
 */
export const FOCUS_PANEL_SUMMARY_CHILD_COMPOSITION: readonly SummaryCompositionEntry[] = [
    {
        key: "children",
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
 *   attendance       the child's operating day. This is the composition where the card's subject is
 *                    unambiguous — the child IS the record of attention — so it never has to ask the
 *                    operator to scope it.
 *   health_safety    what an operator needs to know to care for this child safely right now. Child
 *                    grain only, for the same reason: at case grain it refuses rather than guessing.
 *   children         kept, with the focused child active; siblings are supporting context. A child
 *                    subject is a reason to scope this card, never to remove it.
 *   household        family/relationship context, and honestly family-scoped — it does not claim to
 *                    be child-owned.
 *   financials       what is owed and what happened on the family account, at the locked V5 8/12
 *                    footprint with Billing Preview as its real 4/12 companion.
 *   billing_preview  family-scoped contextual information, placed last and compact precisely
 *                    because it is not child-owned. Its priority differs from Current Work.
 *
 * Layout is the approved artifact's, not the case surface's: the Journey takes a full row, then
 * Financials 8/12 beside Billing Preview 4/12, then a three-card reference band at 4/12 each, then
 * Attendance at a full row. Two cards span all 12 columns, so this panel plans as `grid` rather
 * than `lanes` — see the note on the first entry for why that is the correct trade here.
 */
export const FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION: readonly SummaryCompositionEntry[] = [
    /*
     * ── THE GEOMETRY BELOW IS THE APPROVED ARTIFACT'S, MEASURED FROM IT ──
     *
     * The approved specimen states its own spans: the Process card at FULL ROW, then Financials at
     * 8/12 beside a 4/12 companion; Household, Health & Safety and a third reference card at 4/12
     * each; then Attendance at FULL ROW. Specimen width is 1055px.
     *
     * This composition previously placed Process, Health & Safety and Attendance at six columns
     * each, on a recorded rule that "a 12-column card forces `planPublishedLayout` from `lanes` to
     * `grid` for the whole panel". That rule is REAL — `planLanesFromGrid` returns null the moment
     * any area has `colSpan >= columns` — but the consequence was mis-stated as a prohibition. Grid
     * is not a failure mode: it is the strategy that file documents as "the richest model
     * (vertical/horizontal spans, independent regions) — when present it wins", and it honours
     * colStart/colSpan exactly. The only thing lanes buys is transposition so a short card cannot
     * inherit a tall neighbour's row height. The case composition has shipped a `colSpan: 12`
     * Employment card all along, so grid is already the live strategy on the case surface.
     *
     * Half-width Process is what QA read as "the stage sequence renders vertically". The band CSS
     * has no vertical mode to switch into — `.alloy-os-progression` is `grid-auto-flow: column`
     * unconditionally, with no media or container query anywhere. At 514px its five stages get
     * ~100px each and their labels wrap into tall narrow columns. The rail was always horizontal;
     * it was never given the width the approved specimen gives it.
     */
    {
        // FULL ROW. The Journey is the widest thing on the panel because it is the most horizontal:
        // five stages, each carrying a label and up to two annotation lines, read left to right.
        key: "current_work",
        tier: "work",
        visibility: "visible",
        area: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 2 },
        encodedSpan: "row",
        encodedDensity: "standard",
    },
    {
        /*
         * FINANCIALS — the locked V5 footprint: EIGHT of twelve columns, with a real companion in
         * the remaining four. Not the stretched full-row default, which left the reconciliation
         * floating in whitespace.
         *
         * `Details →` expands it to a full row in place; the ledger is the expanded representation
         * and needs the width, but it earns that width only when the operator asks for it.
         */
        key: "financials",
        tier: "work",
        visibility: "visible",
        area: { colStart: 1, colSpan: 8, rowStart: 3, rowSpan: 2 },
        encodedSpan: 1,
        // `standard` IS the V5 summary. The compact density is a different placement — supporting
        // financial context inside another process — and states the balance without the breakdown.
        encodedDensity: "standard",
    },
    {
        /*
         * The 4/12 companion, and a genuine one rather than filler. Billing Preview answers "is
         * billing CONFIGURED?" while Financials answers "what is owed?" — the readiness of the
         * arrangement beside the state of the account, which is the pairing an operator actually
         * reads together.
         */
        key: "billing_preview",
        tier: "context",
        visibility: "visible",
        area: { colStart: 9, colSpan: 4, rowStart: 3, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    {
        /*
         * The reference band: three 4/12 cards across one row, as the approved panel composes them
         * — Household, Health & Safety, Care Team.
         *
         * Care Team is NOT registered yet, so columns 9–12 of this band are deliberately empty
         * rather than backfilled with whichever card happens to fit. Putting Children there would
         * have matched the band's rhythm and contradicted the approved panel, which places Children
         * at 6/12 in its own row below. An empty cell is an honest reservation; a substitution is a
         * quiet redesign.
         */
        key: "household",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 1, colSpan: 4, rowStart: 5, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        /*
         * HEALTH & SAFETY — and this composition is the only place it can render.
         *
         * The card is CHILD GRAIN ONLY: a case panel covering several children has no single health
         * subject, and the published case-grain Surface correctly shows it refusing with "Select a
         * child to see their health information". Here the child IS the record of attention, so the
         * question "what do I need to know to care for this child safely right now" has an answer.
         *
         * 4/12, in the reference band, at the specimen's own placement and width.
         */
        key: "health_safety",
        tier: "work",
        visibility: "visible",
        area: { colStart: 5, colSpan: 4, rowStart: 5, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },

    {
        /*
         * THE OPERATING DAY, and the one composition where this card has an unambiguous subject.
         *
         * On the case surface Attendance renders against `participantScope` and says "Select a child
         * to see their day" when a family has several children and none is scoped — the honest answer
         * there. Here the child IS the record of attention, so the day is simply about them.
         *
         * It was absent, and the gap was invisible from the case surface: the published layout places
         * Attendance at case grain, so certifying it there passed while opening the SAME child from
         * the Enrolled children lens composed this list instead and rendered no Attendance card at
         * all. A card is only placed where a composition places it.
         *
         * FULL ROW, at the specimen's own span: the approved Attendance is a horizontal day
         * timeline running from expected arrival to expected departure, and a timeline is the one
         * shape that cannot be cropped to half a panel and still be read.
         */
        key: "attendance",
        tier: "work",
        visibility: "visible",
        area: { colStart: 1, colSpan: 12, rowStart: 8, rowSpan: 2 },
        encodedSpan: "row",
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
        area: { colStart: 7, colSpan: 6, rowStart: 10, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    {
        /*
         * CHILDREN at 6/12, which is where the approved panel puts it — paired across the closing
         * row rather than squeezed into the 4/12 reference band above. The panel's own companion
         * there is Staff, which is employee grain and has no place on a child's panel; Assignments
         * is the child-grain card that shares the question "who is placed where".
         */
        key: "children",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 1, colSpan: 6, rowStart: 10, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    { key: "tour_summary", tier: "context", visibility: "linked", encodedSpan: 1, encodedDensity: "compact" },
    { key: "communications", tier: "reference", visibility: "linked", encodedSpan: 1, encodedDensity: "standard" },
    { key: "milestones", tier: "context", visibility: "linked", encodedSpan: 1, encodedDensity: "compact" },
];

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
