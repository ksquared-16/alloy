"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { ApplyRegistryResolvedActionHost } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";

export function useOpportunityDrawerVmHeaderActions(params: {
    opportunityId: string | null | undefined;
    departmentId: string | null | undefined;
    workUnitId: string | null | undefined;
    registryHostExtensions?: Pick<ApplyRegistryResolvedActionHost, "openForm" | "openCreateWork">;
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
                if (action.action_type === "open_form") {
                    const formKey =
                        action.payload?.form_key != null ? String(action.payload.form_key).trim() : "";
                    if (formKey && params.registryHostExtensions?.openForm) {
                        params.registryHostExtensions.openForm({ form_key: formKey, action });
                        return;
                    }
                }
                if (action.action_type === "ui_intent") {
                    const p =
                        action.payload && typeof action.payload === "object"
                            ? (action.payload as Record<string, unknown>)
                            : {};
                    const intent = p.intent != null ? String(p.intent).trim() : "";
                    if (
                        (action.key.trim() === "create_task" || intent === "create_task") &&
                        params.registryHostExtensions?.openCreateWork
                    ) {
                        params.registryHostExtensions.openCreateWork({ opportunity_id: id });
                        return;
                    }
                }
                await applyRegistryResolvedActionClient(action, {
                    router,
                    openDrawer,
                    entityId: id,
                    departmentId: params.departmentId ?? null,
                    workUnitId: params.workUnitId ?? null,
                    ...params.registryHostExtensions,
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
        [params.departmentId, params.opportunityId, params.registryHostExtensions, params.workUnitId, openDrawer, router]
    );

    return { onActionSelect, actionLoadingKey };
}
