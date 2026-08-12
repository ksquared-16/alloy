"use client";

/**
 * Presentation Runtime V2 — configured Workspace actions → workspace header control band.
 *
 * Actions are operational chrome owned by the Workspace header — not the BOS assistant column.
 * Execution stays on `applyRegistryResolvedActionClient` (workspace surface).
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import { WorkspaceCommandRailRegistrar } from "@/app/adminV2/components/workspace/WorkspaceCommandRailRegistrar";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { useCommandRailActionPending } from "@/components/presentation/rightRail/useCommandRailActionPending";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

type Props = {
    actions: ResolvedActionForClient[];
    defaultDepartmentId: string | null;
};

export function WorkspaceRightRailActions({ actions, defaultDepartmentId }: Props) {
    return (
        <>
            <WorkspaceCommandRailRegistrar actions={null} actionsPlacementSurface="company" />
            {actions.length > 0 ? (
                <div data-workspace-actions-chrome="company" className="shrink-0">
                    <CommandRailCollapsibleActionsSection actionCount={actions.length}>
                        <WorkspaceCommandRailActionsBody
                            actions={actions}
                            defaultDepartmentId={defaultDepartmentId}
                        />
                    </CommandRailCollapsibleActionsSection>
                </div>
            ) : null}
        </>
    );
}

function WorkspaceCommandRailActionsBody({ actions, defaultDepartmentId }: Props) {
    const router = useRouter();
    const focusRecord = useOperatorRecordFocus();
    // Immediate acknowledgement — shared with the Work Unit rail. Presentation only; correctness
    // (what the action does / how it refreshes) is untouched.
    const { pendingKey, runWithPending } = useCommandRailActionPending();

    const runAction = useCallback(
        (action: ResolvedActionForClient) => {
            runWithPending(action.key, () =>
                applyRegistryResolvedActionClient(action, {
                    router,
                    focusRecord: (r) => void focusRecord(r),
                    departmentId: defaultDepartmentId,
                    workUnitId: null,
                    entityId: null,
                    context: {
                        surface: "workspace",
                        department_id: defaultDepartmentId,
                        work_unit_id: null,
                    },
                }),
            );
        },
        [runWithPending, router, focusRecord, defaultDepartmentId],
    );

    return (
        <section
            className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
            data-workspace-command-rail-actions="true"
            aria-label="Workspace actions"
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
