"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import WorkUnitWorkspace from "@/app/adminV2/components/workspace/shells/WorkUnitWorkspace";
import type { WorkUnitAboveFoldHeaderHandlers } from "@/app/adminV2/components/workspace/WorkUnitAboveFoldHeaderChips";
import type { WorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT } from "@/lib/ui-v2/adminV2LoadingGeometry";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { buildRealWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/realWorkUnitFromJobs";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import { useDepartmentQueueData, type DepartmentJobsQueueMode } from "@/hooks/useDepartmentQueueData";
import { parseNeedsAttentionExceptionParam } from "@/lib/workspace/exceptionTypes";

const MODE_META: Record<
    DepartmentJobsQueueMode,
    { crumb: string; path: string }
> = {
    unassigned: { crumb: "Unassigned jobs", path: "unassigned" },
    scheduled_today: { crumb: "Today’s Schedule", path: "scheduled-today" },
    needs_attention: { crumb: "Needs Attention", path: "needs-attention" },
};

/**
 * Real work-unit lanes under workspace routes — uses the same `WorkUnitWorkspace` shell as the Admin V2 mock.
 */
export function DepartmentJobsQueuePage({
    workspaceBase,
    departmentId,
    mode,
    deptName,
    departmentKey,
}: {
    workspaceBase: string;
    departmentId: string;
    mode: DepartmentJobsQueueMode;
    deptName: string;
    departmentKey?: string | null;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const exceptionFocus =
        mode === "needs_attention" ? parseNeedsAttentionExceptionParam(searchParams.get("exception")) : null;
    const { openDrawer, drawer } = useAdminDrawer();
    const { jobs, schedules, loading, error, refetch } = useDepartmentQueueData(departmentId, mode, {
        exceptionFilter: exceptionFocus,
    });
    const drawerWasOpen = useRef(false);

    useEffect(() => {
        const isOpen = drawer.type != null && drawer.id != null;
        if (drawerWasOpen.current && !isOpen) {
            refetch();
        }
        drawerWasOpen.current = isOpen;
    }, [drawer.type, drawer.id, refetch]);
    const meta = MODE_META[mode];

    const model = useMemo(
        () =>
            buildRealWorkUnitWorkspaceModel({
                departmentId,
                deptName,
                departmentKey,
                mode,
                exceptionFocus,
                jobs,
                schedules: mode === "scheduled_today" ? schedules : undefined,
            }),
        [departmentId, deptName, departmentKey, mode, exceptionFocus, jobs, schedules]
    );

    /** Jobs bridge lanes are single-queue — no pill strip; rail + queue lane use atomic above-fold slots. */
    const aboveFold = useMemo((): WorkUnitAboveFoldRenderModel => {
        return {
            header: {
                visible: false,
                state: "ready",
                sections: [],
                error_message: null,
                active_queue_description: null,
                show_other_pill: false,
                other_pill: null,
            },
            actions_rail: {
                visible: true,
                state: "ready",
                actions_rail: model.actionsRail,
            },
            queue_lane: {
                visible: true,
                state: "ready",
                skeleton_row_count: ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT,
            },
        };
    }, [model.actionsRail]);

    const aboveFoldHandlers = useMemo(
        (): WorkUnitAboveFoldHeaderHandlers => ({
            onQueueTabChange: () => {},
            onAttentionBucketSelect: () => {},
        }),
        []
    );

    const onWorkspaceAction = useCallback(
        (action: WorkspaceAction) => {
            if (action.type === "queue.item.action" && action.actionId === "open_record") {
                const operationalVisualContext = {
                    departmentKey: departmentKey ?? undefined,
                    laneKey: mode,
                    workUnitVisualContextKey: model.visualContextKey,
                };
                if (mode === "scheduled_today") {
                    openDrawer({ type: "schedules", id: action.itemId, operationalVisualContext });
                } else {
                    openDrawer({
                        type: "jobs",
                        id: action.itemId,
                        jobRecordSurface: "drawer",
                        operationalVisualContext,
                    });
                }
                return;
            }
            if (action.type === "navigate" && action.href) {
                router.push(action.href);
                return;
            }
            if (action.type === "signal.action") {
                if (action.actionId === "nav_jobs") router.push("/admin/jobs");
                if (action.actionId === "nav_schedules") router.push("/admin/schedules");
                return;
            }
            if (action.type === "actions.block") {
                const id = action.actionId;
                if (id === "back_department") router.push(`${workspaceBase}/dept/${departmentId}`);
                else if (id === "open_admin_jobs") router.push("/admin/jobs");
                else if (id === "open_schedules") router.push("/admin/schedules");
                else if (id === "open_work_units") router.push("/admin/system/work-units");
            }
        },
        [departmentId, departmentKey, mode, model.visualContextKey, openDrawer, router, workspaceBase]
    );

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: workspaceBase, label: "Workspace" },
                { href: `${workspaceBase}/dept/${departmentId}`, label: deptName },
                { href: `${workspaceBase}/dept/${departmentId}/${meta.path}`, label: meta.crumb },
            ]}
            title={meta.crumb}
            subtitle=""
        >
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            {loading ? (
                <p className="text-sm text-alloy-midnight/60 py-4">Loading lane…</p>
            ) : (
                <WorkUnitWorkspace
                    model={model}
                    aboveFold={aboveFold}
                    aboveFoldHandlers={aboveFoldHandlers}
                    onAction={onWorkspaceAction}
                    kpiStripPlaceholder={false}
                />
            )}
        </WorkspaceChrome>
    );
}
