/**
 * Agent Config Lab — semantic overview layout preview/apply bridge (job, overview only).
 */

import type { JobOverviewPlannerFailure, JobOverviewPlannerResult } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import { planJobOverviewLayoutRequest } from "@/lib/agent/planner/planJobOverviewLayoutRequest";
import type { JobOverviewResolutionCatalog } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import { JOB_OVERVIEW_RESOLUTION_CATALOG } from "@/lib/agent/planner/jobOverviewResolutionCatalog";
import { buildRecordLayoutStructuredOverrideParts } from "@/lib/admin/agentLab/buildAssistantStructuredOverride";

export type OverviewLayoutSemanticPreviewOk = {
    ok: true;
    structured_override: Record<string, unknown>;
    planner: Extract<JobOverviewPlannerResult, { ok: true }>;
};

export type OverviewLayoutSemanticPreviewErr = {
    ok: false;
    error: string;
    planner: JobOverviewPlannerFailure;
};

export type OverviewLayoutSemanticPreviewResult = OverviewLayoutSemanticPreviewOk | OverviewLayoutSemanticPreviewErr;

/**
 * Run semantic planner + build the same v1 `structured_override` envelope as other lab paths.
 */
export function runOverviewLayoutSemanticPreview(
    commandText: string,
    overviewConfigRaw: unknown,
    catalog: JobOverviewResolutionCatalog = JOB_OVERVIEW_RESOLUTION_CATALOG
): OverviewLayoutSemanticPreviewResult {
    const planner = planJobOverviewLayoutRequest(commandText, overviewConfigRaw, catalog);
    if (!planner.ok) {
        return {
            ok: false,
            error: planner.error,
            planner,
        };
    }
    const structured_override = buildRecordLayoutStructuredOverrideParts(
        planner.config as Record<string, unknown>,
        planner.expected_config_version
    );
    return { ok: true, structured_override, planner };
}
