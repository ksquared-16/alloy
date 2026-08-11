/**
 * Child Attention + family Settlement: keep Settlement chrome (household, children, billing)
 * from the family opportunity VM, but never let the family's persisted stage / Current Work
 * replace the focused child's published stage mission.
 *
 * Record of Attention = child (effective stage + stage Work Templates).
 * Record of Truth / Settlement = family opportunity.
 */

import type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";
import { buildCurrentWorkCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

export function overlayChildMissionOntoSettledFocusModel(
    settled: FocusPanelWorkModeModel,
    commitCritical: FocusPanelCommitCriticalInput,
): FocusPanelWorkModeModel {
    const grain = commitCritical.subjectGrain?.grain;
    if (grain !== "child") return settled;

    const stageWorkRuntime = commitCritical.stageWorkRuntime;
    const publishedStageInputs = commitCritical.publishedStageInputs;
    const situation = commitCritical.situation;

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

    const subjectType = commitCritical.subjectGrain?.subjectType ?? "child";
    const subjectLabel =
        (typeof commitCritical.subjectIdentityTruth?.["child.display_name"] === "string"
            ? String(commitCritical.subjectIdentityTruth["child.display_name"]).trim()
            : null) || settled.title;

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
        subject: {
            id: commitCritical.subjectId,
            type: subjectType,
            label: subjectLabel,
        },
        context: {
            ...settled.context,
            grain: "child",
            subject: {
                type: subjectType,
                id: commitCritical.subjectId,
                label: subjectLabel,
            },
            businessProcess: {
                key: situation?.stageKey ?? settled.context.businessProcess.key,
                label: situation?.stageLabel ?? settled.context.businessProcess.label,
                stageKey: situation?.stageKey ?? settled.context.businessProcess.stageKey,
            },
            stageWorkRuntime,
            publishedStageInputs,
            signals: {
                ...settled.context.signals,
                work: {
                    ...settled.context.signals.work,
                    nextActionLabel,
                },
            },
            truth: {
                ...settled.context.truth,
                ...(stageWorkRuntime ? { _stage_work_runtime: stageWorkRuntime } : {}),
                ...(commitCritical.subjectIdentityTruth ?? {}),
            },
        },
        cardModels,
        cardReadiness,
        title: subjectLabel,
        statusLabel: situation?.stageLabel ?? settled.statusLabel,
        commands,
    };
}
