/**
 * 3C — GRAIN-AWARE SCOPE RESOLUTION for a child subject.
 *
 * THE POST-MERGE COLLISION THIS EXISTS TO PREVENT. `resolveFocusPanelScope` and
 * `firstMatchingVisibleWorkView` evaluate a subject against a lens by running the lens's predicates
 * over it — and those predicates are opportunity-shaped (`opportunity_stage`, and friends). A CHILD
 * row has none of those fields. Run one through that path and it matches nothing, so the answer tells
 * the operator their record has MOVED OUT of the lens they are looking at, and offers to open it in a
 * destination lens chosen by the same broken comparison. A confident, navigable, entirely fabricated
 * answer.
 *
 * It is unreachable today only because `subject_surface_unavailable` refuses a child answer with rows
 * before this code runs. That refusal is scaffolding; it comes out in Phase 4. This module is what
 * has to exist first, so removing it does not turn an accident into a defect.
 *
 * The rule itself: a child's membership was ALREADY decided, by the provider, and it was not decided
 * by an opportunity predicate. So scope asks the same question the provider answered —
 *
 *   a stage-scoped child lens  → is the child's EFFECTIVE stage one of the lens's stages?
 *   a stage-independent child lens → yes; a live participation is in it by definition
 *
 * — and it only ever compares a child against CHILD-grain lenses. A family lens is not a place a
 * child can be, so it is not a destination to offer.
 */

import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import {
    resolveFocusPanelScopeForMembership,
    type FocusPanelScopeState,
} from "@/lib/lifecycle/operationalProjection";

/** The only thing scope needs from a child row: where the child effectively is. */
export type ChildScopeSubject = { stageKey: string | null };

/**
 * How a lens is READ. Both come from the caller rather than being imported, because the only module
 * that already resolves them is the provisioning answer, and importing them back out of it would make
 * a cycle out of a one-way dependency.
 */
export type ChildScopeLensReader = {
    /** The lens's configured stage set — the SAME reader the child row source uses. */
    stageKeysForView: (view: WorkViewConfigV1Stored) => readonly string[];
    /** Is this lens child-grain? Resolved, never guessed; an unresolvable lens answers false. */
    isChildLens: (view: WorkViewConfigV1Stored) => boolean;
};

/**
 * Does this child belong to that lens?
 *
 * Deliberately the provider's rule restated in memory, not a second definition of membership: the
 * stage set is read the same way the row source reads it, and an empty stage set means the lens is
 * stage-independent — which, for a child that reached the answer, means it is already live.
 */
export function childMatchesLens(
    subject: ChildScopeSubject,
    view: WorkViewConfigV1Stored,
    reader: Pick<ChildScopeLensReader, "stageKeysForView">,
): boolean {
    const stageKeys = reader.stageKeysForView(view);
    if (!stageKeys.length) return true; // stage-independent: participation membership, already satisfied
    return subject.stageKey != null && stageKeys.includes(subject.stageKey);
}

/**
 * Classify a child subject against the active lens, considering only child-grain lenses.
 *
 * A lens whose grain cannot be resolved (ambiguous, undeclared) is EXCLUDED rather than assumed: an
 * unresolvable lens is not a destination anyone can be sent to, and guessing its grain here would
 * reintroduce exactly the defaulting G-1 forbids.
 */
export function resolveChildGrainFocusPanelScope(params: {
    subject: ChildScopeSubject | null | undefined;
    activeView: WorkViewConfigV1Stored | null | undefined;
    workViews?: readonly WorkViewConfigV1Stored[] | null;
    reader: ChildScopeLensReader;
}): FocusPanelScopeState {
    const subject = params.subject ?? null;
    const childLenses = (params.workViews ?? []).filter(params.reader.isChildLens);
    return resolveFocusPanelScopeForMembership({
        hasSubject: subject != null,
        activeView: params.activeView,
        workViews: childLenses,
        matches: (view) => (subject ? childMatchesLens(subject, view, params.reader) : false),
    });
}
