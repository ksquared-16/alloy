"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { WorkspaceCommandRailActionsSection } from "@/app/adminV2/components/workspace/WorkspaceCommandRailActionsSection";
import { CreateLeadCommandSurface } from "@/components/platform/commands/createLead/CreateLeadCommandSurface";
import WorkUnitScheduleTourRecordPickerModal from "@/components/admin/workspace/WorkUnitScheduleTourRecordPickerModal";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { resolveCreatedLeadFocusPanelHref } from "@/lib/admin/canonicalOperatorRoutes";
import { countActionsVm } from "@/lib/bos/countActionsVm";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { fetchWorkspaceRootResolvedActions } from "@/lib/workspace/fetchWorkspaceRootResolvedActions";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    mergeEnrollmentRightRailActions,
    REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX,
} from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type { ActionsVm } from "@/lib/ui-v2/workspace-types";

const EMPTY_ACTIONS: ActionsVm = {
    primaries: [],
    systemActions: [],
    quickOperations: [],
    overflow: [],
};

type Props = {
    /** Default department for create-lead and other org-scoped actions on /workspace. */
    defaultDepartmentId?: string | null;
};

/**
 * Workspace root Actions rail — configured business-process actions (`surface=workspace`).
 */
export function WorkspaceRootActionsRail({ defaultDepartmentId = null }: Props) {
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;

    const [resolved, setResolved] = useState<ResolvedActionForClient[] | null>(null);
    const [settled, setSettled] = useState(false);
    const [createLeadOpen, setCreateLeadOpen] = useState(false);
    const [scheduleTourPickerOpen, setScheduleTourPickerOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setSettled(false);
        void fetchWorkspaceRootResolvedActions({ fetchInit: workspaceDataFetchInit() ?? {} })
            .then((list) => {
                if (!cancelled) setResolved(Array.isArray(list) ? list : []);
            })
            .catch(() => {
                if (!cancelled) setResolved([]);
            })
            .finally(() => {
                if (!cancelled) setSettled(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const resolvedByKey = useMemo(() => {
        const m = new Map<string, ResolvedActionForClient>();
        for (const a of resolved ?? []) m.set(a.key, a);
        return m;
    }, [resolved]);

    const model = useMemo(
        () => mergeEnrollmentRightRailActions(resolved ?? [], EMPTY_ACTIONS),
        [resolved]
    );

    const actionCount = useMemo(() => {
        if (!settled) return null;
        return countActionsVm(model, "company");
    }, [model, settled]);

    const openScheduleTourRecordPicker = useCallback(() => {
        setScheduleTourPickerOpen(true);
    }, []);

    const openScheduleTourForOpportunity = useCallback(
        (opportunityId: string) => {
            setScheduleTourPickerOpen(false);
            openDrawer({ type: "opportunities", id: opportunityId });
        },
        [openDrawer]
    );

    const onAction = useCallback(
        async (action: WorkspaceAction) => {
            if (action.type !== "actions.block") return;
            if (action.actionId.startsWith(REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX)) {
                const key = action.actionId.slice(REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX.length);
                const resolvedAction = resolvedByKey.get(key);
                if (!resolvedAction) return;
                await applyRegistryResolvedActionClient(resolvedAction, {
                    router,
                    openDrawer,
                    openCreateLead: () => setCreateLeadOpen(true),
                    openScheduleTourRecordPicker,
                    departmentId: defaultDepartmentId,
                    workUnitId: null,
                    context: {
                        surface: "workspace",
                        department_id: defaultDepartmentId,
                        work_unit_id: null,
                    },
                });
                return;
            }
            window.alert("Coming next: This action is not configured yet.");
        },
        [defaultDepartmentId, openDrawer, openScheduleTourRecordPicker, resolvedByKey, router]
    );

    return (
        <>
            <WorkspaceCommandRailActionsSection
                model={model}
                onAction={onAction}
                surface="company"
                actionCount={actionCount}
                loading={!settled}
                title="Actions"
                slotTestId="workspace-root-actions-rail"
            />
            {defaultDepartmentId ? (
                <CreateLeadCommandSurface
                    open={createLeadOpen}
                    departmentId={defaultDepartmentId}
                    workUnitId={null}
                    surface="workspace"
                    onClose={() => setCreateLeadOpen(false)}
                    onOpenCreatedRecord={(opportunityId) => {
                        // Canonical: open the new lead in the operational workspace, not the legacy drawer.
                        // No current work unit on the root rail → safe fallback to the workspace home.
                        router.push(
                            resolveCreatedLeadFocusPanelHref({
                                recordId: opportunityId,
                                currentWorkUnitKey: null,
                            }),
                        );
                    }}
                />
            ) : null}
            <WorkUnitScheduleTourRecordPickerModal
                open={scheduleTourPickerOpen}
                siteId={selectedSiteId}
                onDismiss={() => setScheduleTourPickerOpen(false)}
                onSelectOpportunityId={openScheduleTourForOpportunity}
            />
        </>
    );
}
