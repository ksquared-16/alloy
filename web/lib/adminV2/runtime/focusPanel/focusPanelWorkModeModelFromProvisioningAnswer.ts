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

import { NULL_BILLING_SIGNAL, type OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import {
    buildCurrentWorkCardModel,
    buildHouseholdCardModel,
    buildChildrenCardModel,
    buildReadinessCardModel,
} from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type { FocusPanelSubjectSnapshot } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
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
    /** Commit-critical Household + Children snapshot (answer-owned). Null → those cards reserve. */
    subjectSnapshot: FocusPanelSubjectSnapshot | null;
};

/** A real, authoritative-fields-only OperationalContext from the committed answer. No placeholder data. */
export function buildCommitCriticalOperationalContext(input: FocusPanelWorkModeFromAnswerInput): OperationalContext {
    const nextActionLabel = input.primaryAction?.label ?? null;
    return {
        grain: "case",
        subject: { type: "opportunity", id: input.subjectId, label: input.title },
        businessProcess: {
            key: input.situation?.stageKey ?? null,
            label: input.situation?.stageLabel ?? input.statusLabel ?? null,
            stageKey: input.situation?.stageKey ?? null,
        },
        perspective: input.perspective
            ? { missionLabel: input.perspective.defaultMission ?? input.perspective.label ?? null }
            : null,
        truth: {
            id: input.subjectId,
            ...(input.statusKey ? { status_key: input.statusKey } : {}),
            ...(input.statusLabel ? { _status_display: input.statusLabel } : {}),
            ...(input.stageWorkRuntime ? { _stage_work_runtime: input.stageWorkRuntime } : {}),
            // A — commit-critical Household + Children content (the evidence builders read these keys),
            // so those cards render MEANINGFUL at commit, not blank. Deeper family detail is Settlement.
            ...(input.subjectSnapshot?.primaryContact.name
                ? { "person.primary_contact_name": input.subjectSnapshot.primaryContact.name }
                : {}),
            ...(input.subjectSnapshot?.primaryContact.phone
                ? { "person.primary_phone": input.subjectSnapshot.primaryContact.phone }
                : {}),
            ...(input.subjectSnapshot?.primaryContact.email
                ? { "person.primary_email": input.subjectSnapshot.primaryContact.email }
                : {}),
            ...(input.subjectSnapshot?.inquiryChildren != null
                ? { _inquiry_children: input.subjectSnapshot.inquiryChildren }
                : {}),
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

    // Current Work is ALWAYS ready at commit — the shared model builder guarantees it matches the
    // enriched card byte-for-byte. Cells not marked ready below default to `reserved` in the grid.
    const cardModels = new Map<FocusPanelCardKey, FocusPanelCardModel>([
        [
            "current_work",
            buildCurrentWorkCardModel({
                stageWorkRuntime: input.stageWorkRuntime,
                nextActionLabel: input.primaryAction?.label ?? null,
            }),
        ],
    ]);
    const cardReadiness = new Map<FocusPanelCardKey, FocusPanelCardReadiness>([["current_work", "ready"]]);

    // A — HOUSEHOLD + CHILDREN are commit-critical: the answer's subject snapshot carries their
    // first-operational content (`context.truth` now holds the same keys the enriched record does), so
    // they render as MEANINGFUL cards at commit — through the SHARED model builders, byte-identical to
    // the enriched cards. Only the deeper family/settlement detail fills in place when the drawer VM lands.
    const truth = context.truth;
    if (input.subjectSnapshot?.primaryContact.name || input.subjectSnapshot?.inquiryChildren != null) {
        cardModels.set("household", buildHouseholdCardModel(truth, input.title));
        cardReadiness.set("household", "ready");
        // READINESS is a pure derivation over the same commit-critical truth (contact + children
        // completeness), so it is knowable — and READY — the moment the subject snapshot is. The
        // attention blockers Settlement discovers later enrich the same cell in place.
        cardModels.set("readiness_kpi", buildReadinessCardModel(context));
        cardReadiness.set("readiness_kpi", "ready");
    }
    if (input.subjectSnapshot?.inquiryChildren != null) {
        cardModels.set("children", buildChildrenCardModel(truth));
        cardReadiness.set("children", "ready");
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
        mode: input.mode,
        subject: { id: input.subjectId, type: "opportunity", label: input.title },
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
