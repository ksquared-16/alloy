/**
 * Case/context Attention + family Settlement: keep Settlement chrome (household,
 * children, billing) from the family opportunity VM, but never let the family's
 * persisted shared stage / Lead Current Work replace an EPP-derived Mission already
 * committed by the provisioning answer.
 *
 * Symmetric to {@link overlayChildMissionOntoSettledFocusModel} for child grain.
 * Record of Attention = family (case). Mission = effective participant tracks.
 */

import type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";
import { buildCurrentWorkCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { mergeSubjectIdentityTruthOntoSettled } from "@/lib/adminV2/runtime/focusPanel/mergeSubjectIdentityTruthOntoSettled";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

/**
 * When commit-critical Mission stage differs from Settlement's stage work (typical:
 * EPP Waitlist vs persisted Lead), overlay the committed Mission onto Settlement.
 * Homogeneous same-stage cases are a no-op (overlay equals settled).
 */
export function overlayContextMissionOntoSettledFocusModel(
    settled: FocusPanelWorkModeModel,
    commitCritical: FocusPanelCommitCriticalInput,
): FocusPanelWorkModeModel {
    const grain = commitCritical.subjectGrain?.grain;
    if (grain !== "case") return settled;

    const stageWorkRuntime = commitCritical.stageWorkRuntime;
    const publishedStageInputs = commitCritical.publishedStageInputs;
    const situation = commitCritical.situation;
    if (!stageWorkRuntime && !situation) return settled;

    const settledStage =
        settled.context.stageWorkRuntime?.stage_key?.trim()
        || settled.context.businessProcess.stageKey?.trim()
        || null;
    const missionStage = situation?.stageKey?.trim() || stageWorkRuntime?.stage_key?.trim() || null;
    // Same Mission stage already on Settlement — keep Settlement enrichment as-is.
    if (missionStage && settledStage && missionStage === settledStage) return settled;

    const nextActionLabel = commitCritical.primaryAction?.label ?? null;
    const cardModels = new Map(settled.cardModels);
    cardModels.set(
        "current_work",
        buildCurrentWorkCardModel({
            stageWorkRuntime,
            nextActionLabel,
        }),
    );

    const cardReadiness = new Map(settled.cardReadiness);
    cardReadiness.set("current_work", "ready");

    const commands: ResolvedActionForClient[] = commitCritical.primaryAction
        ? [
              {
                  key: commitCritical.primaryAction.actionRef,
                  label: commitCritical.primaryAction.label,
                  description: null,
                  action_type: "workflow",
                  icon: null,
                  style: null,
                  display_style: "button",
                  payload: {},
                  workflow_id: null,
              },
          ]
        : settled.commands;

    return {
        ...settled,
        context: {
            ...settled.context,
            businessProcess: {
                key: situation?.stageKey ?? settled.context.businessProcess.key,
                label: situation?.stageLabel ?? settled.context.businessProcess.label,
                stageKey: situation?.stageKey ?? settled.context.businessProcess.stageKey,
                /*
                 * PRESERVED, NOT REBUILT. This overlay changes the MISSION — which stage the
                 * operator is being pointed at — and nothing about which stages the process has.
                 * Rebuilding the struct field by field silently drops anything it does not name,
                 * which is exactly how the configured rail vanished the first time.
                 */
                stages: settled.context.businessProcess.stages,
            },
            stageWorkRuntime: stageWorkRuntime ?? settled.context.stageWorkRuntime,
            publishedStageInputs: publishedStageInputs ?? settled.context.publishedStageInputs,
            signals: {
                ...settled.context.signals,
                work: {
                    ...settled.context.signals.work,
                    nextActionLabel: nextActionLabel ?? settled.context.signals.work.nextActionLabel,
                },
            },
            truth: {
                ...mergeSubjectIdentityTruthOntoSettled(
                    settled.context.truth,
                    commitCritical.subjectIdentityTruth,
                ),
                ...(stageWorkRuntime ? { _stage_work_runtime: stageWorkRuntime } : {}),
            },
        },
        cardModels,
        cardReadiness,
        statusLabel: situation?.stageLabel ?? settled.statusLabel,
        commands,
    };
}
