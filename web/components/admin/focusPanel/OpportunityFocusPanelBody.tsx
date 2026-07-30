"use client";

import { useEffect, useMemo } from "react";

import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import { markFocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitTiming";
import { useActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import { focusPanelWorkModeModelFromDrawerVm } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromDrawerVm";
import { focusPanelWorkModeModelFromProvisioningAnswer } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { SubjectIdentityTruth } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import type { OperationalGrain } from "@/lib/adminV2/runtime/operationalContext/types";

/** Enriched (settled drawer VM) input — present once Settlement has resolved the record VM. */
export type FocusPanelEnrichedInput = {
    displayVm: OpportunityDrawerViewModel;
    record: Record<string, unknown>;
};

/** Commit-critical (provisioning answer) input — used until the drawer VM settles. */
export type FocusPanelCommitCriticalInput = {
    subjectId: string;
    statusKey: string | null;
    stageWorkRuntime: StageWorkRuntimeProjection | null;
    publishedStageInputs: PublishedStageInputsForCurrentWork | null;
    situation: { stageKey: string; stageLabel: string; purpose: string | null } | null;
    primaryAction: { actionRef: string; label: string } | null;
    subjectIdentityTruth: SubjectIdentityTruth | null;
    /** R2 — the subject grain resolved by the answer. Forwarded to the builder; never derived here. */
    subjectGrain: { grain: OperationalGrain; subjectType: OperationalSubjectType } | null;
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
            return focusPanelWorkModeModelFromDrawerVm({
                mode,
                displayVm: enriched.displayVm,
                record: enriched.record,
                title,
                perspective,
                statusLabel,
                canMutate,
            });
        }
        if (commitCritical) {
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

    return (
        <OpportunityFocusPanelModeGrid
            model={model}
            onSelectTab={onSelectTab}
            onHeaderAction={onHeaderAction}
            onModeChange={onModeChange}
        />
    );
}
