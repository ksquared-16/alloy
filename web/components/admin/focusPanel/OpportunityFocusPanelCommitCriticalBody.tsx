"use client";

import { useMemo } from "react";

import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import { useActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import { focusPanelWorkModeModelFromProvisioningAnswer } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";

type Props = {
    mode: FocusPanelMode;
    subjectId: string;
    title: string;
    statusLabel: string | null;
    statusKey: string | null;
    canMutate: boolean;
    stageWorkRuntime: StageWorkRuntimeProjection | null;
    publishedStageInputs: PublishedStageInputsForCurrentWork | null;
    situation: { stageKey: string; stageLabel: string; purpose: string | null } | null;
    primaryAction: { actionRef: string; label: string } | null;
    onSelectTab: (tab: DrawerTabKey) => void;
    onHeaderAction?: (action: ResolvedActionForClient) => void;
    onModeChange?: (mode: FocusPanelMode) => void;
};

/**
 * The COMMIT-CRITICAL Focus Panel body (A). Projects the committed provisioning answer onto the
 * canonical `FocusPanelWorkModeModel` and hands it to the ONE grid — the SAME grid, card ids, and
 * geometry the enriched body uses. Current Work is `ready`; every settlement card is `reserved`.
 * There is no standalone Current Work preview and no alternate layout.
 */
export default function OpportunityFocusPanelCommitCriticalBody({
    mode,
    subjectId,
    title,
    statusLabel,
    statusKey,
    canMutate,
    stageWorkRuntime,
    publishedStageInputs,
    situation,
    primaryAction,
    onSelectTab,
    onHeaderAction,
    onModeChange,
}: Props) {
    const perspective = useActiveRuntimePerspective();
    const model = useMemo(
        () =>
            focusPanelWorkModeModelFromProvisioningAnswer({
                mode,
                subjectId,
                title,
                statusLabel,
                statusKey,
                canMutate,
                perspective,
                stageWorkRuntime,
                publishedStageInputs,
                situation,
                primaryAction,
            }),
        [
            mode,
            subjectId,
            title,
            statusLabel,
            statusKey,
            canMutate,
            perspective,
            stageWorkRuntime,
            publishedStageInputs,
            situation,
            primaryAction,
        ],
    );

    return (
        <OpportunityFocusPanelModeGrid
            model={model}
            onSelectTab={onSelectTab}
            onHeaderAction={onHeaderAction}
            onModeChange={onModeChange}
        />
    );
}
