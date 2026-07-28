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
import dynamic from "next/dynamic";
import { resolveCreatedLeadFocusPanelHref } from "@/lib/admin/canonicalOperatorRoutes";
import { isBosCreateLeadSessionEnabled } from "@/lib/bos/commandSession/bosCreateLeadSessionFlag";
import { dispatchStartBosCommandSession } from "@/contexts/BosCommandSessionContext";

// Create Lead is an event-triggered command surface (opens only on `adminv2:open-create-lead`), never
// part of the first operator paint. Load it dynamically so its ~19k-line subtree (processing-identity
// engine, intake extraction, its own modals) leaves the Work Unit initial-path graph. The host renders
// null until the event fires, so there is no first-paint behavior change — only a one-time chunk load on
// the operator's first "create lead" gesture. (Phase 4 ownership: noncritical modes are not initial-path
// dependencies.)
const CreateLeadCommandSurface = dynamic(
    () =>
        import("@/components/platform/commands/createLead/CreateLeadCommandSurface").then(
            (m) => m.CreateLeadCommandSurface,
        ),
    { ssr: false },
);

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
