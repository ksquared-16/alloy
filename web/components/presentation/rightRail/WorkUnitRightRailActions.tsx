"use client";

/**
 * Presentation Runtime V2 — Work Unit configured actions → workspace header control band.
 *
 * Actions are operational chrome owned by the Work Unit header — not the BOS assistant column.
 * Resolution/execution unchanged (`applyRegistryResolvedActionClient`, work_unit surface).
 * Placement surface is still registered so drawer override rules know the page owns Actions.
 */

import { useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import { WorkspaceCommandRailRegistrar } from "@/app/adminV2/components/workspace/WorkspaceCommandRailRegistrar";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { useCommandRailActionPending } from "@/components/presentation/rightRail/useCommandRailActionPending";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

type Props = {
    actions: ResolvedActionForClient[];
    departmentId: string | null;
    workUnitId: string | null;
};

/** Header-band Actions chrome + placement registration (registrar renders null). */
export function WorkUnitRightRailActions({ actions, departmentId, workUnitId }: Props) {
    return (
        <>
            <WorkspaceCommandRailRegistrar actions={null} actionsPlacementSurface="work_unit" />
            {actions.length > 0 ? (
                <div data-workspace-actions-chrome="work_unit" className="shrink-0">
                    <CommandRailCollapsibleActionsSection actionCount={actions.length}>
                        <WorkUnitCommandRailActionsBody
                            actions={actions}
                            departmentId={departmentId}
                            workUnitId={workUnitId}
                        />
                    </CommandRailCollapsibleActionsSection>
                </div>
            ) : null}
        </>
    );
}

export function WorkUnitCommandRailActionsBody({ actions, departmentId, workUnitId }: Props) {
    const router = useRouter();
    const { drawer } = useAdminDrawer();
    const focusRecord = useOperatorRecordFocus();

    const selectedRecordId =
        drawer.type === "opportunities" && drawer.id != null ? String(drawer.id) : null;

    // Immediate acknowledgement — see useCommandRailActionPending. Presentation only; correctness is
    // untouched (this does not change what the action does or how it refreshes).
    const { pendingKey, runWithPending } = useCommandRailActionPending();

    const runAction = useCallback(
        (action: ResolvedActionForClient) => {
            runWithPending(action.key, () =>
                applyRegistryResolvedActionClient(action, {
                    router,
                    focusRecord: (r) => void focusRecord(r),
                    departmentId,
                    workUnitId,
                    entityId: selectedRecordId,
                    context: {
                        surface: "work_unit",
                        department_id: departmentId,
                        work_unit_id: workUnitId,
                    },
                }),
            );
        },
        [runWithPending, router, focusRecord, departmentId, workUnitId, selectedRecordId],
    );

    return (
        <section
            className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
            data-work-unit-command-rail-actions="true"
            aria-label="Work unit actions"
        >
            <ul className="adminv2-command-rail-executable-actions">
                {actions.map((action) => {
                    const isPending = pendingKey === action.key;
                    return (
                        <li key={action.key}>
                            <button
                                type="button"
                                data-right-rail-action={action.key}
                                data-action-pending={isPending ? "true" : undefined}
                                aria-busy={isPending || undefined}
                                disabled={isPending}
                                title={action.description ?? undefined}
                                onClick={() => runAction(action)}
                                className="adminv2-command-rail-executable-action"
                            >
                                <span className="adminv2-command-rail-executable-action-label">
                                    {action.label}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/** Optional wrapper when composing into WorkspaceHeader actionsSlot. */
export function WorkUnitHeaderActionsSlot(props: Props): ReactNode {
    return <WorkUnitRightRailActions {...props} />;
}
