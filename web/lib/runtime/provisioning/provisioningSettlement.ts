/**
 * THE SETTLEMENT CONTRACT — Phase 2 of two-phase seed emission.
 *
 * It lives in its own module because the route composer carries `import "server-only"` and the
 * BROWSER needs this: the kernel applies settlements client-side. The rule that module already
 * states is the one being honoured here — CONTRACTS may cross to the browser, SERVER
 * IMPLEMENTATIONS may not. Nothing in this file reads a database, a gate or a request.
 *
 * It is a TRANSPORT contract, not a semantic owner. Every field is produced by the same canonical
 * owner that produced it before; nothing here decides facts, membership, stage, configuration,
 * authorization or card semantics.
 */
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { OperationalTourSignal } from "@/lib/adminV2/runtime/operationalContext/types";

/**
 * PHASE 2 — the canonical capability results, delivered independently of the frame.
 *
 * It carries its own NAVIGATION and IDENTITY so a settlement can be REFUSED rather than applied to
 * a frame it does not belong to. That check is the whole safety property: a rapid subject switch, a
 * Work Unit change, a back/forward, or a second tab all produce settlements in flight against a
 * frame that is no longer on screen, and a late one must never mutate the active surface.
 *
 * The kernel transports this. It does not decide any of it: every field is produced by the same
 * canonical owner that produced it before, and nothing here re-derives facts, membership, stage,
 * configuration, authorization or card semantics.
 */
export type ProvisioningSettlementPatch = {
    navigation: {
        target: string;
        lens: string | null;
        subject: string | null;
        cohort: "none" | null;
        aspect: string | null;
    };
    identity: {
        subjectId: string | null;
        stageKey: string | null;
        workViewId: string | null;
    };
    resolvedParticipant: { participationId: string; customerMemberId: string } | null;
    resolvedTour: OperationalTourSignal | null;
    cards: unknown;
};

/** Does this settlement belong to this frame? Navigation AND identity must both agree. */
/**
 * THE SETTLEMENT'S NAVIGATION IDENTITY — built from what the caller REQUESTED, never from what the
 * composer RESOLVED.
 *
 * One function because there were two construction sites and they must not be able to drift. Both
 * previously read a local named `requestedWorkViewId` that the composer reassigns to the slug's
 * implied default before either site runs, so on the ordinary path — no explicit lens in the URL —
 * the settlement was addressed with a lens the frame had never been registered under.
 * `navigationKey` includes the lens, so `frames.get` missed and `applyFrameSettlement` returned
 * `no_frame`, discarding the patch that carries Financials, Attendance and Health.
 *
 * `requestedWorkViewId` here is the URL-carried lens and nothing else. A caller that passes the
 * resolved lens reintroduces the defect, which is what the lifecycle test proves by doing exactly
 * that and watching the settlement fail to find its frame.
 */
export function settlementNavigationForRequest(request: {
    rawSlug: string;
    requestedWorkViewId: string | null;
    requestedSubjectId: string | null;
    cohort?: "none" | null;
    aspect?: string | null;
}): ProvisioningSettlementPatch["navigation"] {
    return {
        target: request.rawSlug,
        lens: request.requestedWorkViewId ?? null,
        subject: request.requestedSubjectId ?? null,
        cohort: request.cohort ?? null,
        aspect: request.aspect ?? null,
    };
}

export function settlementMatchesFrame(
    answer: ProvisioningAnswer,
    patch: ProvisioningSettlementPatch,
    navigation: ProvisioningSettlementPatch["navigation"],
): boolean {
    const n = patch.navigation;
    if (
        n.target !== navigation.target
        || (n.lens ?? null) !== (navigation.lens ?? null)
        || (n.subject ?? null) !== (navigation.subject ?? null)
        || (n.cohort ?? null) !== (navigation.cohort ?? null)
        || (n.aspect ?? null) !== (navigation.aspect ?? null)
    ) return false;
    if (answer.terminal !== "operational") return false;
    const subjectId = answer.recordOfAttention?.id ? String(answer.recordOfAttention.id) : null;
    const stageKey = answer.currentBusinessState?.stageKey ?? null;
    const workViewId = answer.contextFrame?.workViewId ?? null;
    // A settlement composed for a different subject, a different stage, or a different lens
    // describes a different surface. Applying it would be the stale-truth defect, not a late fill.
    return (
        patch.identity.subjectId === subjectId
        && patch.identity.stageKey === stageKey
        && patch.identity.workViewId === workViewId
    );
}

/**
 * Apply a settlement MONOTONICALLY. Returns the answer unchanged when the patch does not belong to
 * it, or when applying a field would REGRESS one that is already known.
 *
 * Monotonic means: UNKNOWN may become KNOWN, and KNOWN may never become UNKNOWN. A duplicate patch
 * is therefore harmless (the second application changes nothing), and an out-of-order one cannot
 * undo a later result, because a field that already holds a value is never overwritten with null.
 */
export function applyProvisioningSettlement(
    answer: ProvisioningAnswer,
    patch: ProvisioningSettlementPatch,
    navigation: ProvisioningSettlementPatch["navigation"],
): ProvisioningAnswer {
    if (!settlementMatchesFrame(answer, patch, navigation)) return answer;
    if (answer.terminal !== "operational") return answer;

    /*
     * IDEMPOTENCE IS A RETURNED IDENTITY, NOT A COMMENT.
     *
     * This used to build `{ ...answer }` unconditionally, so every caller saw a NEW object and a
     * duplicate settlement was indistinguishable from a first one. The lifecycle detects a duplicate
     * by reference (`next === rec.answer`), so that allocation silently defeated the check and
     * `appliedCount` climbed on re-delivery. The plant in twoPhaseSeedEmission.test.ts caught it.
     *
     * So the decision is made BEFORE allocating: work out what each field would become, compare, and
     * hand back the very same answer when nothing would move.
     */
    // KNOWN never regresses to UNKNOWN: a null in the patch leaves whatever the frame already had.
    const nextParticipant = patch.resolvedParticipant ?? answer.resolvedParticipant ?? null;
    const nextTour = (patch.resolvedTour ?? answer.resolvedTour ?? null) as ProvisioningAnswer extends {
        resolvedTour?: infer _T;
    }
        ? OperationalTourSignal | null
        : never;
    const currentCards = answer.focusPanelOperationalProjection?.cards ?? null;
    const cardsChange = patch.cards != null && answer.focusPanelOperationalProjection != null
        && patch.cards !== currentCards;

    const participantChange = nextParticipant !== (answer.resolvedParticipant ?? null);
    const tourChange = nextTour !== (answer.resolvedTour ?? null);
    if (!participantChange && !tourChange && !cardsChange) return answer;

    const next: ProvisioningAnswer = { ...answer };
    if (participantChange) next.resolvedParticipant = nextParticipant;
    if (tourChange) next.resolvedTour = nextTour as typeof next.resolvedTour;
    if (cardsChange && next.focusPanelOperationalProjection) {
        next.focusPanelOperationalProjection = {
            ...next.focusPanelOperationalProjection,
            cards: patch.cards as typeof next.focusPanelOperationalProjection.cards,
        };
    }
    return next;
}

