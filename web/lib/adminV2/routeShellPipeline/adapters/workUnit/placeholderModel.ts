import type { WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import { isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";

export type BuildWorkUnitRouteShellPlaceholderInput = {
    workUnitId?: string;
    workUnitTitle?: string;
    departmentTitle?: string;
    departmentKey?: string;
    reserveActionsRail?: boolean;
};

/** Stable WorkUnitWorkspace geometry before bootstrap returns identity — values hydrate in-place. */
export function buildWorkUnitRouteShellPlaceholder(
    input: BuildWorkUnitRouteShellPlaceholderInput
): WorkUnitWorkspaceModel {
    const wuId = (input.workUnitId ?? "pending").trim() || "pending";
    const deptTitle = (input.departmentTitle ?? "Department").trim() || "Department";
    const wuTitle = (input.workUnitTitle ?? "Work unit").trim() || "Work unit";
    const reserveRail =
        input.reserveActionsRail === true || isEnrollmentLikeDepartmentKey(input.departmentKey);

    return {
        workspaceLevel: "work_unit",
        workUnitId: wuId,
        departmentKey: input.departmentKey,
        laneKey: "queue:shell",
        focusLabel: deptTitle,
        aiSummary: {
            headline: wuTitle,
            subline: deptTitle,
            aiAwarenessLine: undefined,
        },
        laneInterpretation: null,
        signals: [],
        kpis: [],
        primaryQueue: {
            id: `wu:${wuId}:queue:shell`,
            title: "",
            laneQueueLabel: "Loading queue",
            countBadge: undefined,
            items: [],
            rowsLoading: true,
            sortCaption: undefined,
            rollupSummary: undefined,
        },
        workSummary: null,
        actionsRail: {
            primaries: [],
            systemActions: [],
            quickOperations: [],
            overflow: [],
        },
        contextRail: { title: "About", groups: [] },
        ...(reserveRail ? { visualContextKey: input.departmentKey } : {}),
    };
}
