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
import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import { MOUNTABLE_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import type { SubjectIdentityTruth } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
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
    publishedStageInputs: PublishedStageInputsForCurrentWork | null;
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
};

/** A real, authoritative-fields-only OperationalContext from the committed answer. No placeholder data. */
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
            // No configured process rail on this producer — an unstaged context is a real answer.
            stages: [],
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
        participantScope: participantScopeFromChildSubjectTruth({
            ...(input.subjectIdentityTruth ?? {}),
        }),
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
            tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: NULL_BILLING_SIGNAL,
        },
        stageWorkRuntime: input.stageWorkRuntime,
        // The answer OWNS Current Work — it is READY at commit, never a Tier-2 pending.
        stageWorkPending: false,
        // Registry supporting actions are Settlement; the truthful primary command is carried in `signals.work`.
        recordHeaderActions: null,
        publishedStageInputs: input.publishedStageInputs,
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
