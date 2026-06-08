"use client";

/**
 * Opportunity drawer overview tab body — LayoutDoc runtime as the primary path.
 *
 * ## Doctrine
 *
 * - The runtime body is the NORMAL path for workflow_v1 opportunities (capability
 *   gate, not a feature flag). The record is built client-side from the VM the
 *   drawer already holds; only the LayoutDoc is resolved server-side (compose-free).
 * - Layout runtime body is **read-only** — no inline field editing or save paths.
 *   Drawer shell save orchestration (header actions, status mutation, registry
 *   modals) remains VM-owned and is intentionally outside this component.
 *
 * ## Capability fallback (NOT a silent old-UI fallback for in-scope records)
 *
 * 1. Doc not renderable for production (e.g. classic-only config) → VM overview.
 * 2. Doc resolve failure → VM overview.
 * 3. Render-phase error (Error Boundary) → VM overview.
 */

import OpportunityDrawerInquiryWorkflowOverview from "@/components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview";
import OpportunityDrawerLayoutRuntimeShadowDiagnostics from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeShadowDiagnostics";
import LayoutRuntimeDrawerBody from "@/components/layout/LayoutRuntimeDrawerBody";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { logLayoutRuntimeBodyRenderFailure } from "@/lib/layout/runtime/logLayoutRuntimeBodyRenderFailure";
import type { UseOpportunityDrawerLayoutRuntimeShadowResult } from "@/lib/layout/runtime/shadow/useOpportunityDrawerLayoutRuntimeShadow";
import { useOpportunityDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/useOpportunityDrawerLayoutRuntimeBody";

type Props = {
    displayVm: OpportunityDrawerViewModel;
    drawerId: string;
    opportunitySingular: string;
    onSelectTab: (tab: DrawerTabKey) => void;
    vmReady: boolean;
    layoutRuntimeShadow: UseOpportunityDrawerLayoutRuntimeShadowResult;
    /** Commit an edited field (refKey, value) — host PATCHes + optimistically patches the VM. */
    onFieldCommit?: (refKey: string, value: string) => void | Promise<void>;
};

function VmOverviewBody({
    displayVm,
    drawerId,
    opportunitySingular,
    onSelectTab,
}: Pick<Props, "displayVm" | "drawerId" | "opportunitySingular" | "onSelectTab">) {
    return (
        <div data-drawer-vm-runtime-overview="true">
            <OpportunityDrawerInquiryWorkflowOverview
                displayVm={displayVm}
                drawerId={drawerId}
                opportunitySingular={opportunitySingular}
                onSelectTab={onSelectTab}
            />
        </div>
    );
}

export default function OpportunityDrawerOverviewBody(props: Props) {
    const {
        displayVm,
        drawerId,
        opportunitySingular,
        onSelectTab,
        vmReady,
        layoutRuntimeShadow,
        onFieldCommit,
    } = props;

    const statusDisplay =
        displayVm.header.status.renderAs !== "hidden" ? displayVm.header.status.label : null;

    const layoutBody = useOpportunityDrawerLayoutRuntimeBody({
        opportunityId: drawerId,
        vmReady,
        vmRecord: displayVm.above_fold.record,
        statusDisplay,
        summaries: displayVm.summaries,
    });

    const vmFallback = (
        <VmOverviewBody
            displayVm={displayVm}
            drawerId={drawerId}
            opportunitySingular={opportunitySingular}
            onSelectTab={onSelectTab}
        />
    );

    return (
        <div className="space-y-4" data-adminv2-opportunity-drawer-body="true">
            {layoutBody.bodyReady && layoutBody.doc && layoutBody.record ?
                <LayoutRuntimeDrawerBody
                    doc={layoutBody.doc}
                    record={layoutBody.record}
                    layoutSource={layoutBody.layoutSource}
                    surface="opportunity_drawer_overview"
                    fallback={vmFallback}
                    onFieldCommit={onFieldCommit}
                    editableEntity="opportunity"
                    onRenderError={(error) =>
                        logLayoutRuntimeBodyRenderFailure(error, {
                            opportunityId: drawerId,
                            layoutSource: layoutBody.layoutSource,
                            surface: "opportunity_drawer_overview",
                        })
                    }
                />
            :   vmFallback}
            {layoutRuntimeShadow.shadowEnabled && layoutBody.useVmFallback ?
                <div
                    aria-hidden="true"
                    hidden
                    data-layout-runtime-shadow-mount="opportunity"
                    data-shadow-parity-score={layoutRuntimeShadow.telemetry?.parityScore ?? ""}
                    data-shadow-readiness={layoutRuntimeShadow.telemetry?.readinessLevel ?? ""}
                />
            :   null}
            {layoutRuntimeShadow.diagnosticsEnabled ?
                <OpportunityDrawerLayoutRuntimeShadowDiagnostics
                    telemetry={layoutRuntimeShadow.telemetry}
                    evaluating={layoutRuntimeShadow.evaluating}
                    lastError={layoutRuntimeShadow.lastError}
                />
            :   null}
        </div>
    );
}
