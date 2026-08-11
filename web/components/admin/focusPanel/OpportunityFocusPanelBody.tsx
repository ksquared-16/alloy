"use client";

import { useEffect, useMemo } from "react";

import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import OperationalAttentionEnhanceDraft from "@/components/admin/drawer/OperationalAttentionEnhanceDraft";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { markFocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitTiming";
import { useActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import { focusPanelWorkModeModelFromDrawerVm } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromDrawerVm";
import { focusPanelWorkModeModelFromProvisioningAnswer } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import { overlayChildMissionOntoSettledFocusModel } from "@/lib/adminV2/runtime/focusPanel/overlayChildMissionOntoSettledFocusModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";

declare global {
    interface Window {
        __ALLOY_FOCUS_CHILD_MISSION_DIAG__?: Record<string, unknown>;
    }
}

export type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";

/** Enriched (settled drawer VM) input — present once Settlement has resolved the record VM. */
export type FocusPanelEnrichedInput = {
    displayVm: OpportunityDrawerViewModel;
    record: Record<string, unknown>;
};

type Props = {
    mode: FocusPanelMode;
    title: string;
    statusLabel: string | null;
    canMutate: boolean;
    /** Enriched input wins when present; otherwise the commit-critical answer input is used. */
    enriched: FocusPanelEnrichedInput | null;
    commitCritical: FocusPanelCommitCriticalInput | null;
    onSelectTab: (tab: DrawerTabKey) => void;
    onHeaderAction?: (action: ResolvedActionForClient) => void;
    onModeChange?: (mode: FocusPanelMode) => void;
};

/**
 * THE ONE Focus Panel body (A — atomic commit). It renders the SAME `OpportunityFocusPanelModeGrid`
 * instance whether the model is commit-critical (from the provisioning answer) or enriched (from the
 * drawer VM). Because it is one component in one slot, the pending → enriched transition is a model
 * PROP CHANGE, not a remount: same grid, same published composition, same geometry — Settlement only
 * fills reserved cells in place. There is ONE readiness boundary (the destination commit), no
 * card-by-card assembly, and no resize.
 */
export default function OpportunityFocusPanelBody({
    mode,
    title,
    statusLabel,
    canMutate,
    enriched,
    commitCritical,
    onSelectTab,
    onHeaderAction,
    onModeChange,
}: Props) {
    const perspective = useActiveRuntimePerspective();
    const model = useMemo(() => {
        if (enriched) {
            const settled = focusPanelWorkModeModelFromDrawerVm({
                mode,
                displayVm: enriched.displayVm,
                record: enriched.record,
                title,
                perspective,
                statusLabel,
                canMutate,
            });
            // Child Attention must keep the child's published stage mission after Settlement
            // loads the family opportunity VM (which carries the family's persisted Lead work).
            if (commitCritical?.subjectGrain?.grain === "child") {
                const overlaid = overlayChildMissionOntoSettledFocusModel(settled, commitCritical);
                if (typeof window !== "undefined") {
                    const settledCw = settled.cardModels.get("current_work");
                    const overlaidCw = overlaid.cardModels.get("current_work");
                    window.__ALLOY_FOCUS_CHILD_MISSION_DIAG__ = {
                        path: "enriched+overlay",
                        subjectId: commitCritical.subjectId,
                        subjectGrain: commitCritical.subjectGrain,
                        situation: commitCritical.situation,
                        primaryAction: commitCritical.primaryAction,
                        actionAbsence: commitCritical.actionAbsence ?? null,
                        stageWorkRuntimePresent: Boolean(commitCritical.stageWorkRuntime),
                        stageWorkSummary: commitCritical.stageWorkRuntime
                            ? {
                                  stage_key: commitCritical.stageWorkRuntime.stage_key,
                                  stage_label: commitCritical.stageWorkRuntime.stage_label,
                                  journey_segment: commitCritical.stageWorkRuntime.journey_segment,
                                  template_keys: commitCritical.stageWorkRuntime.template_keys,
                                  primary_label: commitCritical.stageWorkRuntime.primary?.label ?? null,
                                  primary_template_key:
                                      commitCritical.stageWorkRuntime.primary?.template_key ?? null,
                                  primary_work_id: commitCritical.stageWorkRuntime.primary?.work_id ?? null,
                                  primary_attempt_count:
                                      commitCritical.stageWorkRuntime.primary?.attempt_count ?? null,
                              }
                            : null,
                        subjectIdentityTruth: commitCritical.subjectIdentityTruth,
                        settledTitle: settled.title,
                        overlaidTitle: overlaid.title,
                        settledCurrentWorkTitle:
                            settledCw && "title" in settledCw ? settledCw.title : null,
                        overlaidCurrentWorkTitle:
                            overlaidCw && "title" in overlaidCw ? overlaidCw.title : null,
                    };
                }
                return overlaid;
            }
            if (typeof window !== "undefined") {
                window.__ALLOY_FOCUS_CHILD_MISSION_DIAG__ = {
                    path: "enriched_no_overlay",
                    subjectId: commitCritical?.subjectId ?? null,
                    subjectGrain: commitCritical?.subjectGrain ?? null,
                    settledTitle: settled.title,
                    reason: "subjectGrain.grain !== child",
                };
            }
            return settled;
        }
        if (commitCritical) {
            if (typeof window !== "undefined") {
                window.__ALLOY_FOCUS_CHILD_MISSION_DIAG__ = {
                    path: "commitCritical_only",
                    subjectId: commitCritical.subjectId,
                    subjectGrain: commitCritical.subjectGrain,
                    situation: commitCritical.situation,
                    primaryAction: commitCritical.primaryAction,
                    stageWorkRuntimePresent: Boolean(commitCritical.stageWorkRuntime),
                };
            }
            return focusPanelWorkModeModelFromProvisioningAnswer({
                mode,
                subjectId: commitCritical.subjectId,
                title,
                statusLabel,
                statusKey: commitCritical.statusKey,
                canMutate,
                perspective,
                stageWorkRuntime: commitCritical.stageWorkRuntime,
                publishedStageInputs: commitCritical.publishedStageInputs,
                situation: commitCritical.situation,
                primaryAction: commitCritical.primaryAction,
                subjectIdentityTruth: commitCritical.subjectIdentityTruth,
                // R2 — forwarded, not decided. The builder reads this instead of hardcoding
                // `grain: "case"` / `subject.type: "opportunity"`.
                subjectGrain: commitCritical.subjectGrain,
            });
        }
        return null;
    }, [mode, title, statusLabel, canMutate, enriched, commitCritical, perspective]);

    // Timing boundary — fires only when the model identity changes (commit-critical arrival,
    // per-card ready set, settlement), never per render frame. Dev/staging gated inside.
    useEffect(() => {
        if (model) markFocusPanelWorkModeModel(model);
    }, [model]);

    if (!model) return null;

    // "NO CONFIGURED ACTION" IS RENDERED, NOT OMITTED — but only when Settlement has not filled
    // the family chrome AND the child mission does not already own What's Next from templates.
    // Child grain overlays keep commitCritical after Settlement; suppress the banner when the
    // child's stage work is authoritative (avoids "no action" while What's Next shows work).
    const childMissionOwnsWhatsNext = commitCritical?.subjectGrain?.grain === "child";
    const absence =
        childMissionOwnsWhatsNext || enriched
            ? null
            : commitCritical?.actionAbsence ?? null;

    // TRUST RUNTIME V1, SLICE 1 — the consumer surface.
    //
    // The governed deterministic enrichment has always had exactly one operator-facing
    // control, `OperationalAttentionEnhanceDraft`. It was reachable only from
    // `OpportunityDrawerOverviewBody`, and Presentation Runtime V2 never mounts that body on
    // work-unit surfaces (`AdminEntityDrawer` returns null there — the inline Focus Panel owns
    // the record surface). The decision was therefore produced, persisted and audited while
    // being invisible to the operator it was produced for.
    //
    // The component is reused VERBATIM — same copy, same visual treatment, same
    // `data-drawer-slot` hooks the drawer QA already asserts. Only its mount point moves.
    //
    // It reads the same compat projection the drawer read (`_attention_suggestion` on the
    // above-fold record) and self-suppresses when there is no draft body, so a subject with no
    // deterministic draft renders exactly as it does today. Commit-critical renders carry no
    // record, so nothing is shown until the VM settles — the pending → enriched transition
    // stays a prop change, never a remount.
    const attentionSuggestion = (enriched?.record?._attention_suggestion ?? null) as
        | AttentionSuggestionV1
        | null;

    return (
        <>
        {attentionSuggestion ? (
            <div className="mb-2" data-focus-panel-slot="trust_enhance_draft">
                <OperationalAttentionEnhanceDraft suggestion={attentionSuggestion} />
            </div>
        ) : null}
        {absence ?
            <p
                className="mb-3 rounded-md border border-dashed border-[var(--alloy-border-subtle,#d4d4d8)] px-3 py-2 text-sm text-[var(--alloy-text-secondary,#52525b)]"
                data-focus-panel-no-action={absence.code}
                role="note"
            >
                {absence.message}
            </p>
        : null}
        <OpportunityFocusPanelModeGrid
            model={model}
            onSelectTab={onSelectTab}
            onHeaderAction={onHeaderAction}
            onModeChange={onModeChange}
        />
        </>
    );
}
