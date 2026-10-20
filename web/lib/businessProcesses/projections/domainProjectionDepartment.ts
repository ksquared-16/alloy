/**
 * "Is this department's process a domain projection, and which Work Views does it publish?"
 *
 * One reading for the totals evaluator and the provisioning answer, so they cannot disagree about
 * whether a department is served by the projection branch. Reads the PUBLISHED department metadata the
 * caller already holds; never a draft.
 */

import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    isDomainProjectionModel,
    resolveProcessModel,
    type ProcessProjectionDomain,
} from "@/lib/lifecycle/processModelV1";
import { normalizeWorkViewsDisplayOrder, type WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

export type DepartmentDomainProjection = {
    process: LifecycleBuilderProcessRecord;
    domain: ProcessProjectionDomain;
    /** The process's published Work Views, in display order. */
    views: WorkViewConfigV1Stored[];
};

export function resolveDepartmentDomainProjection(departmentMetadata: unknown): DepartmentDomainProjection | null {
    const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(departmentMetadata));
    if (!process) return null;
    const model = resolveProcessModel(process);
    if (!isDomainProjectionModel(model)) return null;
    return {
        process,
        domain: model.domain,
        views: normalizeWorkViewsDisplayOrder(process.work_views_v1 ?? []),
    };
}
