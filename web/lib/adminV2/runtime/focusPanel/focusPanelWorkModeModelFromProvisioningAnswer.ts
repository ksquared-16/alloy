/**
 * Producer: provisioning answer → FocusPanelWorkModeModel (the COMMIT-CRITICAL source).
 *
 * Builds a REAL `OperationalContext` from the committed answer — NOT a synthetic drawer VM, and NOT
 * demo/placeholder data. It sets ONLY semantically-authoritative fields: subject identity, Situation
 * (business process/stage), the Current Work stage-work runtime + published stage config, and the
 * truthful primary command. Every settlement-owned signal (attention, tour, communications, billing)
 * is left at its honest empty state and the card is marked `reserved` — the drawer VM fills it in
 * place, in reserved geometry, without changing the composition.
 *
 * Ready-at-commit cards — `current_work` always; `household` / `children` / `readiness_kpi` whenever
 * the answer's subject snapshot carries their first-operational content — are built through the SHARED
 * builders (`buildCurrentWorkCardModel`, `buildHouseholdCardModel`, `buildChildrenCardModel`,
 * `buildReadinessCardModel`), so each is byte-identical to its enriched counterpart. Every other
 * configured card defaults to `reserved` in the grid.
 */

import {
    NULL_BILLING_SIGNAL,
    type OperationalContext,
    type OperationalGrain,
} from "@/lib/adminV2/runtime/operationalContext/types";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import { participantScopeFromChildSubjectTruth } from "@/lib/adminV2/runtime/operationalContext/resolveParticipantScope";
import type { OperationalParticipantScope, OperationalContextSignals } from "@/lib/adminV2/runtime/operationalContext/types";
import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import { MOUNTABLE_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import type { SubjectIdentityTruth } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { FocusPanelOperationalProjection } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";
import type {
    FocusPanelCardReadiness,
    FocusPanelWorkModeModel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

export type FocusPanelWorkModeFromAnswerInput = {
    mode: FocusPanelMode;
    subjectId: string;
    /** Operator-facing title (committed subject's family name, from the queue seed). */
    title: string;
    statusLabel: string | null;
    statusKey: string | null;
    canMutate: boolean;
    perspective: RuntimePerspective | null;
    /** Commit-critical Current Work projection (answer-owned). */
    stageWorkRuntime: StageWorkRuntimeProjection | null;
    /**
     * SERVER-SIDE PROJECTION INPUT ONLY — optional, and the browser no longer supplies it.
     *
     * The server chokepoint builds its context from the answer directly and needs this; the browser
     * carries the PROJECTION instead, so every client call site omits it. Kept on the type because
     * the server path still names it, not because anything on the wire does.
     */
    publishedStageInputs?: PublishedStageInputsForCurrentWork | null;
    /** The server's projection for this subject. The cards read this; they never re-derive it. */
    operationalProjection?: FocusPanelOperationalProjection | null;
    /** Situation (U-P5) from the answer's currentBusinessState. */
    situation: { stageKey: string; stageLabel: string; purpose: string | null } | null;
    /** Truthful primary Action (U-O5). */
    primaryAction: { actionRef: string; label: string } | null;
    /**
     * Commit-critical subject identity truth bindings (answer-owned, DOMAIN-declared). Opaque here: the
     * builder spreads these into `context.truth` without knowing any specific key. Null → the
     * identity-owning cards reserve (the drawer VM fills them). See {@link SubjectIdentityTruth}.
     */
    subjectIdentityTruth: SubjectIdentityTruth | null;
    /**
     * THE AUTHORITATIVE PARTICIPATION, resolved by the caller from `process_instances`.
     *
     * The commit frame could only ever learn its child from `child.*` keys in
     * `subjectIdentityTruth`, which a FAMILY-grain opportunity does not carry. So participantScope
     * was null there, and the two participant-keyed producers reported `unavailable` on every
     * measured sample while the drawer round trip re-learned the same fact. Passed in rather than
     * resolved here because the resolver queries the database and this module is reachable from a
     * client component — the same rule the drawer route already follows. Absent leaves every prior
     * path untouched.
     */
    resolvedParticipant?: { participationId: string; customerMemberId: string } | null;
    /**
     * THE TOUR SIGNAL THE ANSWER RESOLVED — optional, and its ABSENCE is meaningful.
     *
     * Present  => the answer ran the canonical booking projection and this IS the answer, including
     *             a legitimate "no tour" (`scheduled: false`).
     * Absent   => the answer did not resolve it (no subject, or the read failed). The signal stays
     *             settlement-owned and the surface claims nothing.
     *
     * That distinction is the whole point: collapsing "read failed" into `scheduled: false` would
     * publish a KNOWN_ZERO the answer never established, and the collapsed Business Process card
     * would then state "no activity" it does not know — UNKNOWN != ZERO.
     */
    resolvedTour?: OperationalContextSignals["tour"] | null;
    /**
     * R2 — the SUBJECT GRAIN as resolved ONCE by the provisioning answer. Never re-derived here.
     *
     * This replaces two literals below (`grain: "case"`, `subject.type: "opportunity"`) that were simply
     * wrong for any lens whose stages declare `child` — while the answer had already computed the right
     * value a few modules away and published it as `rowGrain`.
     *
     * Optional so the enriched/drawer-VM producer and existing fixtures keep compiling. Absent means the
     * historical family shape — and that is a COMPATIBILITY default, not a grain fallback: a child answer
     * always supplies this field, so no child surface can reach the family default by omission.
     */
    subjectGrain?: { grain: OperationalGrain; subjectType: OperationalSubjectType } | null;
    /**
     * The configured lifecycle rail, computed server-side by the canonical pure builder where the
     * department configuration already lives. Empty when no process is configured — an unstaged
     * context stays a real answer.
     */
    businessProcessStages?: ReadonlyArray<{ key: string; label: string; support?: readonly string[] }> | null;
    /** The configured process name ("Enrollment"), not the generic card title. */
    businessProcessName?: string | null;
};

/** A real, authoritative-fields-only OperationalContext from the committed answer. No placeholder data. */
/**
 * The authoritative participation as a commit-frame scope.
 *
 * Identity only: the commit frame holds no candidate rows to borrow a name or photo from, and
 * inventing either would put one child's presentation on another's card. The two producers this
 * unblocks — Attendance and Health — read `customerMemberId` and nothing else, so identity is the
 * whole requirement.
 */
function scopeFromResolvedParticipantForCommit(
    resolved: { participationId: string; customerMemberId: string } | null,
): OperationalParticipantScope | null {
    if (!resolved) return null;
    return {
        participationId: resolved.participationId,
        customerMemberId: resolved.customerMemberId,
        personId: null,
        displayName: null,
        imageUrl: null,
        stageKey: null,
        stageLabel: null,
    };
}

export function buildCommitCriticalOperationalContext(input: FocusPanelWorkModeFromAnswerInput): OperationalContext {
    const nextActionLabel = input.primaryAction?.label ?? null;
    return {
        // R2: read the answer's resolved grain; never decide one here.
        grain: input.subjectGrain?.grain ?? "case",
        subject: {
            type: input.subjectGrain?.subjectType ?? "opportunity",
            id: input.subjectId,
            label: input.title,
        },
        businessProcess: {
            key: input.situation?.stageKey ?? null,
            label: input.situation?.stageLabel ?? input.statusLabel ?? null,
            stageKey: input.situation?.stageKey ?? null,
            /*
             * THE CONFIGURED RAIL IS NOT A SETTLEMENT FACT.
             *
             * This was `stages: []` on the stated grounds that the rail arrives with the drawer.
             * Measured on deployed staging, that deferral cost ~2,974ms: the card showed the
             * generic "Business Process" with no timeline until settlement, and withholding the
             * drawer left it permanently wrong rather than late.
             *
             * The rail is department CONFIGURATION run through a pure builder, so the composer —
             * which already holds that configuration — answers it at commit. An unstaged context
             * still yields an empty rail, which remains a real answer.
             */
            stages: input.businessProcessStages ? [...input.businessProcessStages] : [],
            ...(input.businessProcessName ? { name: input.businessProcessName } : {}),
        },
        perspective: input.perspective
            ? { missionLabel: input.perspective.defaultMission ?? input.perspective.label ?? null }
            : null,
        /*
         * THE PARTICIPANT, STATED AT COMMIT INSTEAD OF RE-DISCOVERED AFTER SETTLEMENT.
         *
         * `participantScope` was only ever built by the settled context, so a participant-keyed card
         * could mount at commit and STILL not fetch: it resolves its read against this scope, not
         * against raw truth. Measured: the card mounted at ~1350ms and its request did not leave until
         * ~3313ms, waiting for a scope the answer already had the identity to state.
         *
         * This invents nothing. `participantScopeFromChildSubjectTruth` is the existing resolver for
         * exactly this case and refuses unless BOTH `child.customer_member_id` and
         * `child.process_instance_id` are present — a scope that cannot be identified is not returned.
         * On any other grain it yields null and the card reserves exactly as before.
         */
        /*
         * A STATED CHILD SUBJECT STILL WINS. A child-grain frame has been told its subject
         * directly and needs no resolution; only when it has not is the authoritative
         * single-participant answer consulted. Same precedence as the settled context, so the two
         * frames cannot disagree about which child the panel is about.
         */
        participantScope:
            participantScopeFromChildSubjectTruth({
                ...(input.subjectIdentityTruth ?? {}),
            })
            ?? scopeFromResolvedParticipantForCommit(input.resolvedParticipant ?? null),
        truth: {
            id: input.subjectId,
            ...(input.statusKey ? { status_key: input.statusKey } : {}),
            ...(input.statusLabel ? { _status_display: input.statusLabel } : {}),
            ...(input.stageWorkRuntime ? { _stage_work_runtime: input.stageWorkRuntime } : {}),
            // A — commit-critical subject identity truth. The DOMAIN composer declared these bindings
            // (which keys, from which entity); the platform builder forwards them OPAQUELY — it names no
            // domain truth key. The evidence builders read whatever keys the domain supplied; a second
            // surface supplies its own. Deeper detail = Settlement.
            ...(input.subjectIdentityTruth ?? {}),
        },
        signals: {
            // Current Work data lives in `stageWorkRuntime` (below); the work SUMMARY rollup is a
            // settlement-level projection — reserved here, carrying only the authoritative next action.
            work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel },
            // Settlement-owned signals — honest empty (reserved), never fabricated.
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            /*
             * Resolved by the ANSWER when it could be; otherwise the honest settlement-owned empty.
             * `?? NULL` here is not a default for a failed read — the composer omits the field
             * entirely in that case, which is what keeps absent distinguishable from "no tour".
             */
            tour: input.resolvedTour
                ?? { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: NULL_BILLING_SIGNAL,
        },
        stageWorkRuntime: input.stageWorkRuntime,
        // The answer OWNS Current Work — it is READY at commit, never a Tier-2 pending.
        stageWorkPending: false,
        // Registry supporting actions are Settlement; the truthful primary command is carried in `signals.work`.
        recordHeaderActions: null,
        publishedStageInputs: input.publishedStageInputs,
        // Carried, never recomputed: the server already decided this subject's card truth.
        operationalProjection: input.operationalProjection ?? null,
        capabilities: { canMutate: input.canMutate, maskedChannels: false },
        status: "ready",
    };
}

export function focusPanelWorkModeModelFromProvisioningAnswer(
    input: FocusPanelWorkModeFromAnswerInput,
): FocusPanelWorkModeModel {
    const context = buildCommitCriticalOperationalContext(input);

    // A — the ready set is DERIVED, not hardcoded: every registered commit-critical card whose
    // first-operational content is knowable from the answer's context renders READY at commit,
    // through the SHARED builders (byte-identical to the enriched cards). Unknowable cards are simply
    // absent → the grid reserves their configured cells and Settlement fills them in place.
    const cardModels = new Map<FocusPanelCardKey, FocusPanelCardModel>();
    const cardReadiness = new Map<FocusPanelCardKey, FocusPanelCardReadiness>();
    for (const spec of COMMIT_CRITICAL_CARD_SPECS) {
        if (!spec.isKnowable(context)) continue;
        cardModels.set(spec.key, spec.build(context));
        cardReadiness.set(spec.key, "ready");
    }

    /*
     * B — MOUNTABILITY, asked separately from content and only after it.
     *
     * A card whose content is knowable is already `ready` above and is left alone. What remains are
     * cards that fetch their own data: their content can never be commit-knowable, but their IDENTITY
     * can be, and that is all they need to start asking. Admitting them as `self_loading` mounts the
     * real card in its own truthful loading state instead of a blank reserve, so its request begins at
     * commit rather than after Settlement hands back an id the answer already carried.
     *
     * Never upgrades an existing entry: content readiness wins, and this can only fill a gap.
     */
    for (const spec of MOUNTABLE_CARD_SPECS) {
        if (cardReadiness.has(spec.key)) continue;
        if (!spec.identityKnowable(context)) continue;
        cardModels.set(spec.key, spec.build(context));
        cardReadiness.set(spec.key, "self_loading");
    }

    // Commit-critical commands: the truthful primary action (U-O5) as one resolved command. The
    // enriched producer carries the full resolved command set.
    const commands: ResolvedActionForClient[] = input.primaryAction
        ? [
              {
                  key: input.primaryAction.actionRef,
                  label: input.primaryAction.label,
                  description: null,
                  action_type: "workflow",
                  icon: null,
                  style: null,
                  display_style: "button",
                  payload: {},
                  workflow_id: null,
              },
          ]
        : [];

    return {
        source: "provisioning_answer",
        // Commit-critical: cards outside the ready set are genuinely still settling.
        phase: "commit",
        mode: input.mode,
        // R2: same resolved grain as the context above — the model and its context must never disagree
        // about what the subject IS.
        subject: { id: input.subjectId, type: input.subjectGrain?.subjectType ?? "opportunity", label: input.title },
        context,
        cardModels,
        cardReadiness,
        commands,
        title: input.title,
        statusLabel: input.statusLabel,
        canMutate: input.canMutate,
        perspective: input.perspective,
    };
}
