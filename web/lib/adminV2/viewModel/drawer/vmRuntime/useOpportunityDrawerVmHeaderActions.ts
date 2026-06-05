"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";

export function useOpportunityDrawerVmHeaderActions(params: {
    opportunityId: string | null | undefined;
    departmentId: string | null | undefined;
    workUnitId: string | null | undefined;
}) {
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);

    const onActionSelect = useCallback(
        async (action: ResolvedActionForClient) => {
            const id = params.opportunityId?.trim();
            if (!id) return;
            setActionLoadingKey(action.key);
            try {
                await applyRegistryResolvedActionClient(action, {
                    router,
                    openDrawer,
                    entityId: id,
                    departmentId: params.departmentId ?? null,
                    workUnitId: params.workUnitId ?? null,
                    context: {
                        surface: "record_header",
                        department_id: params.departmentId ?? null,
                        work_unit_id: params.workUnitId ?? null,
                    },
                    invalidate: () => {
                        window.dispatchEvent(
                            new CustomEvent("admin-entity-saved", {
                                detail: { type: "opportunities", id },
                            })
                        );
                    },
                });
            } finally {
                setActionLoadingKey(null);
            }
        },
        [params.departmentId, params.opportunityId, params.workUnitId, openDrawer, router]
    );

    return { onActionSelect, actionLoadingKey };
}
