/**
 * CONTEXTUAL FOCUS — host + subject + ASPECT, with NO active Work View.
 *
 * ── THE STATE THE RUNTIME COULD NOT PREVIOUSLY EXPRESS ──
 *
 * `composeWorkUnitProvisioningAnswer` resolves its lens as
 *
 *     findWorkViewById(views, requested) ?? firstVisibleWorkView(views)
 *
 * so a request naming NO lens is indistinguishable from one choosing the first. That fallback is the
 * live defect: opening `Kelly → Household` lands on the household case, whose host Work Unit is a
 * builder-owned stage unit, and the operator is shown `New` as though they had selected it. They did
 * not select anything — they asked for a person.
 *
 * "Open Kelly" and "enter the New cohort" are different operator intents. The runtime had vocabulary
 * for the second only, so the first had to borrow it.
 *
 * ── WHAT THIS IS, AND IS NOT ──
 *
 * It is the ABSENCE of a lens, made explicit and serveable. It is NOT a synthetic "neutral" Work View:
 * inventing one to satisfy a type would reintroduce the same lie one layer down, and the pill strip
 * would have something to mark selected.
 *
 * Deliberately absent, because none of it is true without a chosen cohort:
 *   - `activeWorkView`     nothing is selected
 *   - `rows` / page        there is no cohort to page through
 *   - `rowGrain`           a grain is a property of a lens's rows; there are none
 *   - `recordOfAttention`  the subject is NAMED by the operator, not chosen from an evaluated page
 *   - `contextFrame`       the operator entered from no Work View
 *
 * `lensSet` IS carried: the operator must still be able to choose a cohort afterwards. Offering the
 * choice is not the same as pre-making it.
 *
 * ── WHY THIS IS A SEPARATE MODULE, NOT A VARIANT OF `ProvisioningAnswer` ──
 *
 * `ProvisioningAnswer` is a discriminated union consumed by exhaustive switches across the surface
 * model, the pill strip and the Focus Panel. Adding a member is a compile-time change at every one of
 * those sites, and on this host the only typechecker is CI. So the contract lands first, provably, and
 * the union membership + rendering follow as their own change with the type errors as the checklist.
 *
 * Nothing produces this answer yet. It is the shape the producer must satisfy.
 */

import type { LensSetEntry } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { OperationalGrain } from "@/lib/adminV2/runtime/operationalContext/types";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";

/**
 * The card + item the operator asked for, in the kernel's own ASPECT vocabulary — finer than the
 * subject and therefore inheriting it.
 */
export type ContextualAspect = {
    /** e.g. the Household card. */
    cardKey: string;
    /** The row inside that card — a person, a child. Null focuses the card itself. */
    itemId: string | null;
};

/**
 * A contextual focus answer: the operator named a RECORD, not a cohort.
 *
 * `terminal: "contextual"` sits alongside `operational` / `empty` / `error` as a distinct, honest
 * outcome. It is not a degraded `operational` — nothing failed, and nothing is missing that the
 * operator asked for.
 */
export type ContextualFocusAnswer = {
    terminal: "contextual";
    orgId: string;
    /**
     * The Work Unit HOSTING the record. Infrastructure truth, not an operator cohort choice — a
     * builder-owned stage unit is a perfectly valid host, and saying so does not imply its default
     * Work View was selected.
     */
    workUnit: { id: string; key: string; name: string; departmentId: string | null };
    businessProcess: { key: string; name: string };
    /**
     * ABSENCE, STATED. Not `undefined` (which reads as "not computed") and never a placeholder view.
     * Consumers must render no pill as selected.
     */
    activeWorkView: null;
    /** The cohorts the operator MAY choose next. Offering the choice is not making it. */
    lensSet: LensSetEntry[];
    /** The record whose Focus Panel composes — the host of the panel, e.g. the family case. */
    recordOfTruth: { entityType: string; id: string };
    /** Who the operator asked for. NAMED, never chosen from an evaluated page. */
    subject: { id: string; grain: OperationalGrain; subjectType: OperationalSubjectType };
    aspect: ContextualAspect | null;
    timings: { total_ms: number };
};

/** Inputs a contextual answer needs. Everything here is resolved by the caller's earlier phases. */
export type ContextualFocusInput = {
    orgId: string;
    workUnit: { id: string; key: string; name: string; departmentId: string | null };
    businessProcess: { key: string; name: string };
    lensSet: LensSetEntry[];
    recordOfTruth: { entityType: string; id: string };
    subject: { id: string; grain: OperationalGrain; subjectType: OperationalSubjectType };
    aspect?: ContextualAspect | null;
    startedAt: number;
    now: () => number;
};

export type ContextualFocusResult =
    | { ok: true; answer: ContextualFocusAnswer }
    | { ok: false; reason: string };

/**
 * Compose the contextual answer.
 *
 * PURE — no Supabase, no fetching. The caller has already established authorization, the Work Unit,
 * the Business Process and the host record; this only states the resulting attention honestly.
 *
 * Refuses rather than degrades. A contextual answer with no host record or no subject is not a
 * weaker answer, it is a meaningless one — and the caller's existing error terminal is the truthful
 * place for that, not a half-populated panel.
 */
export function composeContextualFocusAnswer(
    input: ContextualFocusInput,
): ContextualFocusResult {
    const subjectId = (input.subject?.id ?? "").trim();
    const recordId = (input.recordOfTruth?.id ?? "").trim();

    if (!recordId) {
        return { ok: false, reason: "contextual focus needs a host record to compose against" };
    }
    if (!subjectId) {
        return { ok: false, reason: "contextual focus needs a named subject" };
    }

    // An ASPECT with no card is not an aspect. Drop it rather than carry a shape the panel would have
    // to guess at — the card is what makes the item addressable.
    const cardKey = (input.aspect?.cardKey ?? "").trim();
    const aspect: ContextualAspect | null = cardKey
        ? { cardKey, itemId: (input.aspect?.itemId ?? "")?.trim() || null }
        : null;

    return {
        ok: true,
        answer: {
            terminal: "contextual",
            orgId: input.orgId,
            workUnit: input.workUnit,
            businessProcess: input.businessProcess,
            // Explicitly null. The whole point.
            activeWorkView: null,
            lensSet: input.lensSet,
            recordOfTruth: { entityType: input.recordOfTruth.entityType, id: recordId },
            subject: {
                id: subjectId,
                grain: input.subject.grain,
                subjectType: input.subject.subjectType,
            },
            aspect,
            timings: { total_ms: input.now() - input.startedAt },
        },
    };
}

/**
 * Is this answer one where the operator chose a cohort?
 *
 * A single reading, so the pill strip, the URL projection and any surface chrome cannot disagree about
 * whether to mark something selected. Written as a predicate over the ABSENCE rather than a
 * `terminal === "contextual"` check, so it stays correct if other lens-free terminals appear.
 */
export function hasOperatorSelectedWorkView(
    answer: { activeWorkView?: { id: string } | null } | null | undefined,
): boolean {
    return Boolean(answer?.activeWorkView?.id);
}

/**
 * WHICH cohort the operator selected, or `null` for none.
 *
 * The value form of {@link hasOperatorSelectedWorkView}, and structurally typed the same way so it
 * accepts the whole `ProvisioningAnswer` union — including the `error` variant, which carries no
 * `activeWorkView` field at all. Every call site that wants "the lens, if any" reads it here, so no
 * consumer re-derives the answer with its own `terminal !== "error"` guess — a guess that was correct
 * only while every non-error terminal happened to have a lens.
 *
 * `null` means NO LENS. It is never an instruction to find one.
 */
export function selectedWorkViewId(
    answer: { activeWorkView?: { id: string } | null } | null | undefined,
): string | null {
    return answer?.activeWorkView?.id ?? null;
}
