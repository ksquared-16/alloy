/**
 * Orchestrate opportunity drawer shadow parity capture + compare (Phase 3).
 */

import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { buildLayoutRuntimePlan } from "../layoutRuntimePlan";
import { captureLayoutRuntimeDrawerStructure } from "./captureLayoutRuntimeDrawerStructure";
import { captureVmOpportunityDrawerStructure } from "./captureVmOpportunityDrawerStructure";
import { compareOpportunityDrawerShadowParity } from "./compareOpportunityDrawerShadowParity";
import type { ShadowParityReport } from "./drawerStructureSnapshot";

export type BuildShadowParityReportInput = {
    vm: OpportunityDrawerViewModel;
    doc: LayoutDoc;
    layoutKey?: string;
};

/** Capture VM + layout runtime structures and compare for one opportunity record. */
export function buildOpportunityDrawerShadowParityReport(input: BuildShadowParityReportInput): ShadowParityReport {
    const vmSnapshot = captureVmOpportunityDrawerStructure(input.vm);
    const plan = buildLayoutRuntimePlan(input.doc);
    const layoutSnapshot = captureLayoutRuntimeDrawerStructure({
        doc: input.doc,
        plan,
        recordId: input.vm.entity.id,
    });
    const layoutKey = input.layoutKey ?? plan.layoutKey;
    return compareOpportunityDrawerShadowParity({
        vm: vmSnapshot,
        layout: layoutSnapshot,
        layoutKey,
    });
}
