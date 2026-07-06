"use client";

/**
 * Presentation Runtime V2 — page-level Create Lead modal host.
 *
 * Mounted at the stable surface level (WorkUnit/Workspace), outside the command-rail floating menu,
 * so the modal survives menu dismissal. Open Record routes into Work Unit Focus Panel (Work mode),
 * not the legacy adminV2 drawer.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateLeadCommandSurface } from "@/components/platform/commands/createLead/CreateLeadCommandSurface";
import { resolveCreatedLeadFocusPanelHref } from "@/lib/admin/canonicalOperatorRoutes";

type OpenScope = { departmentId: string; workUnitId: string | null };

export function CreateLeadEventHost() {
    const router = useRouter();
    const [scope, setScope] = useState<OpenScope | null>(null);

    useEffect(() => {
        const onOpen = (event: Event) => {
            const detail = ((event as CustomEvent).detail ?? {}) as {
                department_id?: string | null;
                work_unit_id?: string | null;
            };
            const departmentId = detail.department_id?.trim() || null;
            if (!departmentId) return;
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
            onOpenCreatedRecord={(opportunityId, focusPanelHref) => {
                close();
                router.push(
                    focusPanelHref ??
                        resolveCreatedLeadFocusPanelHref({ recordId: opportunityId }),
                );
            }}
            onRefresh={() => router.refresh()}
        />
    );
}
