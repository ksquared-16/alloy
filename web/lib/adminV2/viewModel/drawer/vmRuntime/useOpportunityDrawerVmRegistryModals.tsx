"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import OpportunityRecordCreateWorkModal from "@/components/admin/opportunity/OpportunityRecordCreateWorkModal";
import SendFormToOpportunityModal from "@/components/admin/opportunity/SendFormToOpportunityModal";
import OpportunityEnrollmentPacketModal from "@/components/admin/opportunity/OpportunityEnrollmentPacketModal";
import { OpportunityTourScheduleActionModal } from "@/components/admin/opportunity/tours/OpportunityTourScheduleActionModal";
import { RecordTourOutcomeModal } from "@/components/admin/opportunity/actions/RecordTourOutcomeModal";
import { AddNoteModal } from "@/components/admin/opportunity/actions/AddNoteModal";
import type { ApplyRegistryResolvedActionHost } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    ADMIN_V2_OPEN_CREATE_WORK_MODAL,
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
    type OpportunityOpenCreateWorkModalDetail,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import {
    ADMINV2_OPEN_TOUR_OUTCOME_MODAL,
    ADMINV2_OPEN_TOUR_SCHEDULE_MODAL,
} from "@/lib/tours/actions/tourBookingActionClient";

type ActionFormState = {
    form_key: string;
    action: ResolvedActionForClient;
};

type Params = {
    opportunityId: string | null | undefined;
    record: Record<string, unknown> | null | undefined;
    canMutate: boolean;
};

function readStringField(record: Record<string, unknown> | null | undefined, key: string): string | null {
    if (!record || typeof record !== "object") return null;
    const v = record[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function executeOpportunityHeaderAction(params: {
    opportunityId: string;
    actionKey: string;
    workUnitId?: string | null;
    payload?: Record<string, unknown>;
}): Promise<void> {
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action_key: params.actionKey,
            entity_type: "opportunity",
            entity_id: params.opportunityId,
            context: { surface: "record_header", work_unit_id: params.workUnitId ?? null },
            payload: params.payload,
        }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Action failed");
    }
}

/**
 * VM opportunity drawer: registry actions dispatch window events and open_form callbacks
 * that Legacy used to own. Without this host, header Actions menu clicks are silent no-ops.
 */
export function useOpportunityDrawerVmRegistryModals({ opportunityId, record, canMutate }: Params): {
    modals: ReactNode;
    registryHostExtensions: Pick<ApplyRegistryResolvedActionHost, "openForm" | "openCreateWork">;
} {
    const oid = opportunityId?.trim() ?? "";
    const [createWorkOpen, setCreateWorkOpen] = useState(false);
    const [createWorkPrefill, setCreateWorkPrefill] = useState<
        OpportunityOpenCreateWorkModalDetail["prefill"] | undefined
    >(undefined);
    const [sendFormOpen, setSendFormOpen] = useState(false);
    const [launchPacketOpen, setLaunchPacketOpen] = useState(false);
    const [actionFormState, setActionFormState] = useState<ActionFormState | null>(null);
    const pendingTourScheduleRef = useRef<{ id: string; action_key?: string } | null>(null);

    /** Direct host callback from header actions — always targets the mounted drawer. */
    const openCreateWorkDirect = useCallback((detail: OpportunityOpenCreateWorkModalDetail) => {
        setCreateWorkPrefill(detail.prefill ?? undefined);
        setCreateWorkOpen(true);
    }, []);

    const openCreateWorkFromEvent = useCallback(
        (detail: OpportunityOpenCreateWorkModalDetail) => {
            const id = detail.opportunity_id?.trim() ?? "";
            if (!id || id !== oid) return;
            openCreateWorkDirect(detail);
        },
        [oid, openCreateWorkDirect]
    );

    const openForm = useCallback(
        (opts: { form_key: string; action: ResolvedActionForClient }) => {
            if (!oid) return;
            setActionFormState({ form_key: opts.form_key, action: opts.action });
        },
        [oid]
    );

    const dispatchOpportunityRefresh = useCallback(() => {
        if (!oid) return;
        window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "opportunities", id: oid } }));
        window.dispatchEvent(
            new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, { detail: { opportunity_id: oid } })
        );
        window.dispatchEvent(new CustomEvent("adminv2:opportunity-updated", { detail: { id: oid } }));
    }, [oid]);

    useEffect(() => {
        if (!oid) return;

        const matchesDrawer = (id: string) => id === oid;

        const onOpenCreateWork = (ev: Event) => {
            const detail = (ev as CustomEvent<OpportunityOpenCreateWorkModalDetail>).detail;
            const id = detail?.opportunity_id?.trim() ?? "";
            if (!matchesDrawer(id)) return;
            openCreateWorkFromEvent(detail);
        };

        const onOpenSendForm = (ev: Event) => {
            const id = typeof (ev as CustomEvent<{ opportunity_id?: string }>).detail?.opportunity_id === "string"
                ? (ev as CustomEvent<{ opportunity_id?: string }>).detail!.opportunity_id!.trim()
                : "";
            if (!matchesDrawer(id)) return;
            setSendFormOpen(true);
        };

        const onOpenEnrollmentPacket = (ev: Event) => {
            const id = typeof (ev as CustomEvent<{ opportunity_id?: string }>).detail?.opportunity_id === "string"
                ? (ev as CustomEvent<{ opportunity_id?: string }>).detail!.opportunity_id!.trim()
                : "";
            if (!matchesDrawer(id)) return;
            setLaunchPacketOpen(true);
        };

        const onOpenTourSchedule = (ev: Event) => {
            const ce = ev as CustomEvent<{ opportunity_id?: string; action_key?: string }>;
            const id = typeof ce.detail?.opportunity_id === "string" ? ce.detail.opportunity_id.trim() : "";
            if (!id) return;
            const actionKey = ce.detail?.action_key;
            pendingTourScheduleRef.current = { id, action_key: actionKey };
            if (!matchesDrawer(id)) return;
            pendingTourScheduleRef.current = null;
            setActionFormState({
                form_key: "schedule_tour",
                action: {
                    key: actionKey === "reschedule_tour" ? "reschedule_tour" : "schedule_tour",
                    label: actionKey === "reschedule_tour" ? "Reschedule tour" : "Schedule tour",
                    description: null,
                    action_type: "open_form",
                    icon: null,
                    style: null,
                    display_style: "button",
                    payload: { form_key: "schedule_tour" },
                    workflow_id: null,
                },
            });
        };

        const onOpenTourOutcome = (ev: Event) => {
            const id = typeof (ev as CustomEvent<{ opportunity_id?: string }>).detail?.opportunity_id === "string"
                ? (ev as CustomEvent<{ opportunity_id?: string }>).detail!.opportunity_id!.trim()
                : "";
            if (!matchesDrawer(id)) return;
            setActionFormState({
                form_key: "record_tour_outcome",
                action: {
                    key: "record_tour_outcome",
                    label: "Record tour outcome",
                    description: null,
                    action_type: "open_form",
                    icon: null,
                    style: null,
                    display_style: "button",
                    payload: { form_key: "record_tour_outcome" },
                    workflow_id: null,
                },
            });
        };

        window.addEventListener(ADMIN_V2_OPEN_CREATE_WORK_MODAL, onOpenCreateWork as EventListener);
        window.addEventListener("adminv2:open-send-form", onOpenSendForm as EventListener);
        window.addEventListener("adminv2:open-enrollment-packet", onOpenEnrollmentPacket as EventListener);
        window.addEventListener(ADMINV2_OPEN_TOUR_SCHEDULE_MODAL, onOpenTourSchedule as EventListener);
        window.addEventListener(ADMINV2_OPEN_TOUR_OUTCOME_MODAL, onOpenTourOutcome as EventListener);

        return () => {
            window.removeEventListener(ADMIN_V2_OPEN_CREATE_WORK_MODAL, onOpenCreateWork as EventListener);
            window.removeEventListener("adminv2:open-send-form", onOpenSendForm as EventListener);
            window.removeEventListener("adminv2:open-enrollment-packet", onOpenEnrollmentPacket as EventListener);
            window.removeEventListener(ADMINV2_OPEN_TOUR_SCHEDULE_MODAL, onOpenTourSchedule as EventListener);
            window.removeEventListener(ADMINV2_OPEN_TOUR_OUTCOME_MODAL, onOpenTourOutcome as EventListener);
        };
    }, [oid, openCreateWorkFromEvent]);

    useEffect(() => {
        const pending = pendingTourScheduleRef.current;
        if (!pending || pending.id !== oid) return;
        pendingTourScheduleRef.current = null;
        setActionFormState({
            form_key: "schedule_tour",
            action: {
                key: pending.action_key === "reschedule_tour" ? "reschedule_tour" : "schedule_tour",
                label: pending.action_key === "reschedule_tour" ? "Reschedule tour" : "Schedule tour",
                description: null,
                action_type: "open_form",
                icon: null,
                style: null,
                display_style: "button",
                payload: { form_key: "schedule_tour" },
                workflow_id: null,
            },
        });
    }, [oid]);

    useEffect(() => {
        setCreateWorkOpen(false);
        setCreateWorkPrefill(undefined);
        setSendFormOpen(false);
        setLaunchPacketOpen(false);
        setActionFormState(null);
    }, [oid]);

    const entityLabel = readStringField(record, "name");
    const lifecycleStageKey = readStringField(record, "_effective_lifecycle_stage");
    const recordOwnerUserId = readStringField(record, "assigned_to");
    const locationId = readStringField(record, "location_id") ?? readStringField(record, "_location_id");
    const workUnitId = readStringField(record, "work_unit_id");
    const metadata =
        record && typeof record.metadata === "object" && record.metadata != null ?
            (record.metadata as Record<string, unknown>)
        :   null;
    const initialTourDate = typeof metadata?.tour_date === "string" ? metadata.tour_date.trim() : null;
    const initialTourTime = typeof metadata?.tour_time === "string" ? metadata.tour_time.trim() : null;

    const modals = useMemo(() => {
        if (!oid) return null;

        const actionKey = actionFormState?.action?.key ? String(actionFormState.action.key) : "";

        return (
            <>
                {createWorkOpen ?
                    <OpportunityRecordCreateWorkModal
                        open={createWorkOpen}
                        opportunityId={oid}
                        entityLabel={entityLabel}
                        prefill={createWorkPrefill}
                        lifecycleStageKey={lifecycleStageKey}
                        recordOwnerUserId={recordOwnerUserId}
                        onClose={() => {
                            setCreateWorkOpen(false);
                            setCreateWorkPrefill(undefined);
                        }}
                    />
                :   null}
                {sendFormOpen ?
                    <SendFormToOpportunityModal
                        open={sendFormOpen}
                        opportunityId={oid}
                        opportunityLabel={entityLabel ?? "Opportunity"}
                        familyLabel={readStringField(record, "_customer_name")}
                        canMutate={canMutate}
                        onDismiss={() => setSendFormOpen(false)}
                    />
                :   null}
                {launchPacketOpen ?
                    <OpportunityEnrollmentPacketModal
                        open={launchPacketOpen}
                        opportunityId={oid}
                        opportunityLabel={entityLabel ?? "Opportunity"}
                        opportunityRecord={record}
                        canMutate={canMutate}
                        onDismiss={() => setLaunchPacketOpen(false)}
                    />
                :   null}
                <OpportunityTourScheduleActionModal
                    open={
                        actionFormState?.form_key === "schedule_tour" || actionFormState?.action?.key === "reschedule_tour"
                    }
                    onClose={() => setActionFormState(null)}
                    title={actionFormState?.action?.label ?? "Schedule tour"}
                    submitLabel={actionFormState?.action?.label ?? "Save"}
                    opportunityId={oid}
                    locationId={locationId}
                    initialTourDate={initialTourDate}
                    initialTourTime={initialTourTime}
                    onSlotBooked={async () => {
                        dispatchOpportunityRefresh();
                    }}
                    onLegacySubmit={async (payload) => {
                        await executeOpportunityHeaderAction({
                            opportunityId: oid,
                            actionKey: actionKey || "schedule_tour",
                            workUnitId,
                            payload,
                        });
                        setActionFormState(null);
                        dispatchOpportunityRefresh();
                    }}
                />
                <RecordTourOutcomeModal
                    open={actionFormState?.form_key === "record_tour_outcome"}
                    onClose={() => setActionFormState(null)}
                    title={actionFormState?.action?.label ?? "Record tour outcome"}
                    onSubmit={async (payload) => {
                        await executeOpportunityHeaderAction({
                            opportunityId: oid,
                            actionKey: actionKey || "record_tour_outcome",
                            workUnitId,
                            payload: { outcome: payload.outcome },
                        });
                        setActionFormState(null);
                        dispatchOpportunityRefresh();
                    }}
                />
                <AddNoteModal
                    open={actionFormState?.form_key === "add_note"}
                    onClose={() => setActionFormState(null)}
                    title={actionFormState?.action?.label ?? "Add note"}
                    onSubmit={async (payload) => {
                        await executeOpportunityHeaderAction({
                            opportunityId: oid,
                            actionKey: actionKey || "add_note",
                            workUnitId,
                            payload,
                        });
                        setActionFormState(null);
                        dispatchOpportunityRefresh();
                    }}
                />
            </>
        );
    }, [
        actionFormState,
        canMutate,
        createWorkOpen,
        createWorkPrefill,
        dispatchOpportunityRefresh,
        entityLabel,
        initialTourDate,
        initialTourTime,
        launchPacketOpen,
        lifecycleStageKey,
        locationId,
        oid,
        record,
        recordOwnerUserId,
        sendFormOpen,
        workUnitId,
    ]);

    const registryHostExtensions = useMemo(
        () => ({
            openForm,
            openCreateWork: openCreateWorkDirect,
        }),
        [openCreateWorkDirect, openForm]
    );

    return { modals, registryHostExtensions };
}
