"use client";

/**
 * Presentation Runtime V2 — page-level Create Lead modal host.
 *
 * The command-rail action buttons render inside CommandRailFloatingMenu, which dismisses on any
 * document click outside its own DOM (capture-phase pointerdown) and UNMOUNTS its children. So the
 * Create Lead modal must NOT be hosted inside that menu — a click inside the modal (a separate
 * body portal) would read as "outside", close the menu, and unmount the modal with it.
 *
 * Instead the action runtime dispatches `adminv2:open-create-lead` (its existing no-local-host
 * path), and THIS host — mounted at the stable surface level (WorkUnit/Workspace), outside the
 * floating menu — opens the platform Create Lead surface. The modal now survives the menu closing;
 * it dismisses only on Close / Escape / cancel / completion, per the command surface's own owner.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateLeadCommandSurface } from "@/components/platform/commands/createLead/CreateLeadCommandSurface";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";

type OpenScope = { departmentId: string; workUnitId: string | null };

export function CreateLeadEventHost() {
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const [scope, setScope] = useState<OpenScope | null>(null);

    useEffect(() => {
        const onOpen = (event: Event) => {
            const detail = ((event as CustomEvent).detail ?? {}) as {
                department_id?: string | null;
                work_unit_id?: string | null;
            };
            const departmentId = detail.department_id?.trim() || null;
            if (!departmentId) return; // Create Lead needs a target department.
            setScope({ departmentId, workUnitId: detail.work_unit_id?.trim() || null });
        };
        window.addEventListener("adminv2:open-create-lead", onOpen as EventListener);
        return () => window.removeEventListener("adminv2:open-create-lead", onOpen as EventListener);
    }, []);

    const close = useCallback(() => setScope(null), []);

    if (!scope) return null;
    return (
        <CreateLeadCommandSurface
            open
            departmentId={scope.departmentId}
            workUnitId={scope.workUnitId}
            surface={scope.workUnitId ? "work_unit" : "workspace"}
            onClose={close}
            onOpenCreatedRecord={(opportunityId) => {
                close();
                openDrawer({ type: "opportunities", id: opportunityId });
            }}
            onRefresh={() => router.refresh()}
        />
    );
}
