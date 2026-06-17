"use client";

/**
 * Renders one drawer shell zone partition from a LayoutDoc slice (summary strip or body).
 * Content is layout-owned; this component only hosts the zone container.
 */

import LayoutRuntimeSectionFlowView from "@/components/layout/LayoutRuntimeSectionFlowView";
import LayoutRuntimeDrawerEditProvider from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { leadOverviewCompositionHints, shouldUseLeadOverviewComposition } from "@/lib/layout/runtime/leadOverviewComposition";
import { personOverviewCompositionHints, shouldUsePersonOverviewComposition } from "@/lib/layout/runtime/personOverviewComposition";
import { childOverviewCompositionHints, shouldUseChildOverviewComposition } from "@/lib/layout/runtime/childOverviewComposition";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type DrawerLayoutRuntimeShellZone = "summary_strip" | "body";

type Props = {
    zone: DrawerLayoutRuntimeShellZone;
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    entityId: string;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
};

export default function DrawerLayoutRuntimeShellZoneView({
    zone,
    doc,
    record,
    entityId,
    canMutate = false,
    onAdornmentAction,
}: Props) {
    if (!doc.sections.length) return null;

    const isSummaryStrip = zone === "summary_strip";
    const compositionHints =
        isSummaryStrip && shouldUseLeadOverviewComposition(doc) ? leadOverviewCompositionHints()
        : isSummaryStrip && shouldUsePersonOverviewComposition(doc) ? personOverviewCompositionHints()
        : isSummaryStrip && shouldUseChildOverviewComposition(doc) ? childOverviewCompositionHints()
        :   {};

    return (
        <LayoutRuntimeCompositionProvider value={compositionHints}>
        <div
            className={
                isSummaryStrip ?
                    "[&_[data-layout-runtime-summary-row]]:items-stretch [&_[data-layout-runtime-summary-widget]]:min-h-[3.25rem]"
                :   undefined
            }
            data-drawer-layout-runtime-shell-zone={zone}
            data-drawer-layout-runtime-shell-zone-sections={doc.sections.map((s) => s.key).join(",")}
        >
            <LayoutRuntimeDrawerEditProvider record={record}>
                <LayoutRuntimeSectionFlowView
                    doc={doc}
                    sections={doc.sections}
                    record={record}
                    entityId={entityId}
                    canMutate={canMutate}
                    onAdornmentAction={onAdornmentAction}
                    sectionPresentation={isSummaryStrip ? "summary_strip" : "default"}
                    stackClassName={isSummaryStrip ? "space-y-2" : undefined}
                />
            </LayoutRuntimeDrawerEditProvider>
        </div>
        </LayoutRuntimeCompositionProvider>
    );
}
