"use client";

/**
 * Presentation Runtime V2 — the Work Unit Right Rail action content (rendered inside RR.SURFACE).
 *
 * Consumes the resolved `right_rail_actions` lane from the WU surface model and renders one
 * control per configured action. Execution goes through the EXISTING action runtime
 * (`applyRegistryResolvedActionClient`) with a `work_unit` surface context — no new resolver, no
 * new action runtime, no hardcoded actions. `create_lead` opens the platform Create Lead command
 * surface; `schedule_tour` and record-scoped actions target the currently selected Focus Panel
 * record (the WU auto-opens the first record), degrading to a legible "select a record" message
 * when none is selected. The `display_style: "menu_item"` actions render as secondary controls.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateLeadCommandSurface } from "@/components/platform/commands/createLead/CreateLeadCommandSurface";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useWorkUnitSlugRouteOptional } from "@/contexts/WorkUnitSlugRouteContext";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

const PRIMARY_CLASS =
    "motion-control block w-full rounded-md border border-alloy-juniper bg-alloy-juniper px-3 py-2 text-left text-[13px] font-semibold text-white hover:bg-alloy-juniper/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper";
const SECONDARY_CLASS =
    "motion-control block w-full rounded-md border border-alloy-stone/30 bg-white px-3 py-2 text-left text-[13px] font-semibold text-alloy-midnight hover:border-alloy-juniper/50 hover:bg-alloy-juniper/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-juniper";

export function WorkUnitRightRailActions({ actions }: { actions: ResolvedActionForClient[] }) {
    const router = useRouter();
    const { drawer, openDrawer } = useAdminDrawer();
    const slugRoute = useWorkUnitSlugRouteOptional();
    const departmentId = slugRoute?.departmentId ?? null;
    const workUnitId = slugRoute?.workUnitId ?? null;
    const [createLeadOpen, setCreateLeadOpen] = useState(false);

    // The record currently open in the inline Focus Panel — the target for record-scoped
    // actions (e.g. schedule_tour). Null when nothing is selected.
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
        <>
            <div className="flex flex-col gap-2">
                {actions.map((action) => {
                    const secondary = (action.display_style ?? "").toLowerCase() === "menu_item";
                    return (
                        <button
                            key={action.key}
                            type="button"
                            data-right-rail-action={action.key}
                            title={action.description ?? undefined}
                            onClick={() => runAction(action)}
                            className={secondary ? SECONDARY_CLASS : PRIMARY_CLASS}
                        >
                            {action.label}
                        </button>
                    );
                })}
            </div>
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
        </>
    );
}
