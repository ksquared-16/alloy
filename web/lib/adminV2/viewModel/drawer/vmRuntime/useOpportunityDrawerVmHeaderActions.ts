"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { ApplyRegistryResolvedActionHost } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { isScheduleTourRegistryAction } from "@/lib/admin/actions/scheduleTourWorkUnitActions";
import {
    resolveOpportunityRegistryActionErrorMessage,
    resolveOpportunityRegistryActionSuccessMessage,
} from "@/lib/admin/actions/resolveOpportunityRegistryActionFeedbackMessage";
import { dispatchOpportunityDrawerScopedUpdate } from "@/lib/admin/opportunityDrawerTargetedRefresh";

function resolveScheduleTourFormKey(action: ResolvedActionForClient): string {
    const fromPayload =
        action.payload?.form_key != null ? String(action.payload.form_key).trim() : "";
    if (fromPayload) return fromPayload;
    return action.key.trim() === "reschedule_tour" ? "schedule_tour" : "schedule_tour";
}

function readUiIntent(action: ResolvedActionForClient): string {
    const p = action.payload && typeof action.payload === "object" ? action.payload : {};
    return p.intent != null ? String(p.intent).trim() : "";
}

export type OpportunityDrawerVmHeaderActionHost = {
    showSuccess: (message: string, opts?: { workflow_run_id?: string }) => void;
    showError: (message: string) => void;
    clearPreflight: () => void;
    applyPreflightBlocked: (detail: {
        opportunity_id: string;
        action_preflight?: import("@/lib/admin/actions/actionPreflightPresentation").ActionPreflightUiPayload;
    }) => void;
};

export function useOpportunityDrawerVmHeaderActions(params: {
    opportunityId: string | null | undefined;
    departmentId: string | null | undefined;
    workUnitId: string | null | undefined;
    registryHostExtensions?: Pick<
        ApplyRegistryResolvedActionHost,
        "openForm" | "openCreateWork" | "openAddInquiryChild" | "openAddPerson" | "openRelationshipAction" | "openEnrollmentStatus"
    >;
    actionHost: OpportunityDrawerVmHeaderActionHost;
}) {
    const router = useRouter();
    const focusRecord = useOperatorRecordFocus();
    const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
    const { showSuccess, showError, clearPreflight, applyPreflightBlocked } = params.actionHost;

    const onActionSelect = useCallback(
        async (action: ResolvedActionForClient) => {
            const id = params.opportunityId?.trim();
            if (!id) {
                showError("Select an opportunity before running actions.");
                return;
            }
            const actionKey = action.key.trim();
            const intent = readUiIntent(action);
            const host = params.registryHostExtensions;

            setActionLoadingKey(action.key);
            clearPreflight();
            try {
                if (
                    (actionKey === "create_task"
                        || actionKey === "create_work_item"
                        || intent === "create_task"
                        || intent === "create_work_item")
                    && host?.openCreateWork
                ) {
                    host.openCreateWork({ opportunity_id: id });
                    return;
                }

                if (isScheduleTourRegistryAction(action) && host?.openForm) {
                    const formKey = resolveScheduleTourFormKey(action);
                    host.openForm({ form_key: formKey, action });
                    return;
                }

                const result = await applyRegistryResolvedActionClient(action, {
                    router,
                    focusRecord: (r) => void focusRecord(r),
                    entityId: id,
                    departmentId: params.departmentId ?? null,
                    workUnitId: params.workUnitId ?? null,
                    ...host,
                    context: {
                        surface: "record_header",
                        department_id: params.departmentId ?? null,
                        work_unit_id: params.workUnitId ?? null,
                    },
                    invalidate: (opts) => {
                        dispatchOpportunityDrawerScopedUpdate(
                            id,
                            opts?.action_key ?? actionKey,
                            ["activity", "header_actions"]
                        );
                    },
                });

                if (!result.ok) {
                    if (result.action_preflight) {
                        applyPreflightBlocked({
                            opportunity_id: id,
                            action_preflight: result.action_preflight,
                        });
                        return;
                    }
                    showError(resolveOpportunityRegistryActionErrorMessage(result.error));
                    return;
                }

                if (
                    action.action_type === "open_form" ||
                    action.action_type === "navigate" ||
                    action.action_type === "external_link" ||
                    action.action_type === "open_drawer"
                ) {
                    return;
                }
                if (action.action_type === "ui_intent") {
                    const resolvedIntent = readUiIntent(action);
                    if (
                        resolvedIntent === "relationship_action" ||
                        resolvedIntent === "send_form" ||
                        resolvedIntent === "send_enrollment_packet" ||
                        resolvedIntent === "create_task" ||
                        resolvedIntent === "create_work_item" ||
                        resolvedIntent === "quick_message" ||
                        actionKey === "quick_message" ||
                        actionKey === "review_enrollment_packet" ||
                        // Owns its own per-channel result copy ("Email queued ·
                        // SMS not sent — suppressed"). A generic "completed" toast
                        // on top would contradict it and re-introduce the very
                        // claim the success contract forbids.
                        resolvedIntent === "send_tour_invitation" ||
                        actionKey === "send_tour_invitation" ||
                        // Opens ChangeLeadLocationModal — success belongs to the modal save path.
                        actionKey === "change_lead_location"
                    ) {
                        return;
                    }
                }

                const er = result.execution_result;
                showSuccess(
                    resolveOpportunityRegistryActionSuccessMessage(action, er),
                    er?.kind === "start_workflow" && typeof er.workflow_run_id === "string"
                        ? { workflow_run_id: er.workflow_run_id }
                        : undefined
                );
            } catch (e) {
                showError(resolveOpportunityRegistryActionErrorMessage((e as Error).message));
            } finally {
                setActionLoadingKey(null);
            }
        },
        [
            params.departmentId,
            params.opportunityId,
            params.registryHostExtensions,
            params.workUnitId,
            applyPreflightBlocked,
            clearPreflight,
            focusRecord,
            router,
            showError,
            showSuccess,
        ]
    );

    return { onActionSelect, actionLoadingKey };
}
