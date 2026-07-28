"use client";

/**
 * Presentation Runtime — Create Lead launch host.
 *
 * Primary path (default): starts a BOS command session via
 * `alloy-bos:start-command-session`. Compatibility fallback: legacy
 * CreateLeadCommandSurface modal when `NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION=0`.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateLeadCommandSurface } from "@/components/platform/commands/createLead/CreateLeadCommandSurface";
import { resolveCreatedLeadFocusPanelHref } from "@/lib/admin/canonicalOperatorRoutes";
import { isBosCreateLeadSessionEnabled } from "@/lib/bos/commandSession/bosCreateLeadSessionFlag";
import { dispatchStartBosCommandSession } from "@/contexts/BosCommandSessionContext";

type OpenScope = { departmentId: string; workUnitId: string | null };

export function CreateLeadEventHost() {
    const router = useRouter();
    const [scope, setScope] = useState<OpenScope | null>(null);
    const bosSessionEnabled = isBosCreateLeadSessionEnabled();

    useEffect(() => {
        const onOpen = (event: Event) => {
            const detail = ((event as CustomEvent).detail ?? {}) as {
                department_id?: string | null;
                work_unit_id?: string | null;
            };
            const departmentId = detail.department_id?.trim() || null;
            if (!departmentId) return;
            const workUnitId = detail.work_unit_id?.trim() || null;
            if (bosSessionEnabled) {
                dispatchStartBosCommandSession({
                    actionKey: "create_lead",
                    displayLabel: "Create Lead",
                    placement: workUnitId ? "work_unit_actions" : "workspace_actions_menu",
                    contextResolution: "bos_proposal",
                    workspace: {
                        departmentId,
                        workUnitId,
                        surface: workUnitId ? "work_unit" : "workspace",
                    },
                });
                return;
            }
            setScope({ departmentId, workUnitId });
        };
        window.addEventListener("adminv2:open-create-lead", onOpen as EventListener);
        return () => window.removeEventListener("adminv2:open-create-lead", onOpen as EventListener);
    }, [bosSessionEnabled]);

    const close = useCallback(() => setScope(null), []);

    if (bosSessionEnabled || !scope) return null;
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
