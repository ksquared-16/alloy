"use client";

/**
 * Presentation Runtime V2 — Work Unit configured actions → the PERSISTENT operator command rail.
 *
 * The operator's right rail is the shell-level command rail (`AdminV2PersistentCommandRail`), not
 * a per-surface column. So the resolved `right_rail_actions` are REGISTERED into that rail via
 * `WorkspaceCommandRailRegistrar` (placement surface `work_unit`) — they render inside the shell's
 * "Actions (N)" collapsible, the SINGLE action presentation path. No second rail, no standalone
 * center buttons, no new renderer/resolver/runtime.
 *
 * Because the registered node renders inside the shell (ABOVE the work-unit route context), the
 * execution scope (`departmentId`/`workUnitId`) is BAKED IN as props; router + drawer come from
 * shell-level providers. Execution stays on the existing runtime (`applyRegistryResolvedActionClient`,
 * `work_unit` surface): `create_lead` → CreateLeadCommandSurface; `schedule_tour`/record-scoped →
 * the currently-open Focus Panel record. Empty payload → register nothing → the rail's own default
 * empty state (`Actions (0)`), so the empty state shows ONLY when the payload is actually empty.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import { WorkspaceCommandRailRegistrar } from "@/app/adminV2/components/workspace/WorkspaceCommandRailRegistrar";
import { CreateLeadCommandSurface } from "@/components/platform/commands/createLead/CreateLeadCommandSurface";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

type Props = {
    actions: ResolvedActionForClient[];
    /** Baked scope — the shell command rail cannot read the work-unit route context. */
    departmentId: string | null;
    workUnitId: string | null;
};

/**
 * Renders null; registers the resolved actions into the shell command rail. Non-empty payload →
 * an "Actions (N)" section body; empty → register null so the rail shows its own default.
 */
export function WorkUnitRightRailActions({ actions, departmentId, workUnitId }: Props) {
    const railContent =
        actions.length > 0 ? (
            <CommandRailCollapsibleActionsSection actionCount={actions.length}>
                <WorkUnitCommandRailActionsBody
                    actions={actions}
                    departmentId={departmentId}
                    workUnitId={workUnitId}
                />
            </CommandRailCollapsibleActionsSection>
        ) : null;

    return (
        <WorkspaceCommandRailRegistrar actions={railContent} actionsPlacementSurface="work_unit" />
    );
}

/**
 * The action rows + execution, rendered INSIDE the shell command rail (via the registrar). Uses
 * the command rail's native executable-action styling so the configured actions read as part of
 * the rail. Scope is prop-baked; router/drawer resolve from shell providers.
 */
export function WorkUnitCommandRailActionsBody({ actions, departmentId, workUnitId }: Props) {
    const router = useRouter();
    const { drawer, openDrawer } = useAdminDrawer();
    const [createLeadOpen, setCreateLeadOpen] = useState(false);

    // Record currently open in the inline Focus Panel — target for record-scoped actions.
    const selectedRecordId =
        drawer.type === "opportunities" && drawer.id != null ? String(drawer.id) : null;

    const runAction = useCallback(
        (action: ResolvedActionForClient) => {
            void applyRegistryResolvedActionClient(action, {
                router,
                openDrawer,
                openCreateLead: () => setCreateLeadOpen(true),
                departmentId,
                workUnitId,
                entityId: selectedRecordId,
                context: {
                    surface: "work_unit",
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                },
            });
        },
        [router, openDrawer, departmentId, workUnitId, selectedRecordId],
    );

    return (
        <section
            className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
            data-work-unit-command-rail-actions="true"
            aria-label="Work unit actions"
        >
            <ul className="adminv2-command-rail-executable-actions">
                {actions.map((action) => (
                    <li key={action.key}>
                        <button
                            type="button"
                            data-right-rail-action={action.key}
                            title={action.description ?? undefined}
                            onClick={() => runAction(action)}
                            className="adminv2-command-rail-executable-action"
                        >
                            <span className="adminv2-command-rail-executable-action-label">
                                {action.label}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            {departmentId ? (
                <CreateLeadCommandSurface
                    open={createLeadOpen}
                    departmentId={departmentId}
                    workUnitId={workUnitId}
                    surface="work_unit"
                    onClose={() => setCreateLeadOpen(false)}
                    onOpenCreatedRecord={(opportunityId) => {
                        // Open the new lead inline in this work unit's Focus Panel (in-page).
                        setCreateLeadOpen(false);
                        openDrawer({ type: "opportunities", id: opportunityId });
                    }}
                    onRefresh={() => router.refresh()}
                />
            ) : null}
        </section>
    );
}
