"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

// These three modals are rendered ONLY while their `*Open` flag is true (`{open ? <Modal/> : null}`),
// i.e. after an explicit operator action — never at first paint. Statically importing them (esp. the
// ~958-line OpportunityEnrollmentPacketModal + its forms/packet builder) forced that weight into the
// initial Work Unit chunk that must download+hydrate before the first provisioning request. Lazy-load
// on open (ssr:false) so they leave the first-paint critical path.
const OpportunityRecordCreateWorkModal = dynamic(
    () => import("@/components/admin/opportunity/OpportunityRecordCreateWorkModal"),
    { ssr: false },
);
const SendFormToOpportunityModal = dynamic(
    () => import("@/components/admin/opportunity/SendFormToOpportunityModal"),
    { ssr: false },
);
const OpportunityEnrollmentPacketModal = dynamic(
    () => import("@/components/admin/opportunity/OpportunityEnrollmentPacketModal"),
    { ssr: false },
);
import { OpportunityTourScheduleActionModal } from "@/components/admin/opportunity/tours/OpportunityTourScheduleActionModal";
import { OpportunityPacketReviewModal } from "@/components/admin/opportunity/OpportunityPacketReviewModal";
import { ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW } from "@/lib/admin/actions/enrollmentActionClient";
import {
    fetchPacketReviewSessions,
    resolvePendingPacketReviewSession,
    type PacketReviewSession,
} from "@/lib/adminV2/runtime/focusPanel/packetReview/resolvePendingPacketReviewSession";
import { RecordTourOutcomeModal } from "@/components/admin/opportunity/actions/RecordTourOutcomeModal";
import { AddNoteModal } from "@/components/admin/opportunity/actions/AddNoteModal";
import { AddInquiryChildModal } from "@/components/admin/opportunity/actions/AddInquiryChildModal";
import { AddPersonModal } from "@/components/admin/opportunity/actions/AddPersonModal";
import RelationshipActionGuidedModal from "@/components/layout/RelationshipActionGuidedModal";
import { ChangeEnrollmentStatusModal } from "@/components/admin/opportunity/actions/ChangeEnrollmentStatusModal";
import { ChangeLeadLocationModal } from "@/components/admin/opportunity/actions/ChangeLeadLocationModal";
import {
    ADMINV2_OPEN_RELATIONSHIP_ACTION_MODAL,
    parseOpenRelationshipActionModalDetail,
} from "@/lib/admin/relationship/relationshipActionClient";
import {
    ADMINV2_OPEN_ENROLLMENT_STATUS_MODAL,
    parseOpenEnrollmentStatusModalDetail,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionClient";
import {
    ADMINV2_OPEN_CHANGE_LEAD_LOCATION_MODAL,
    parseOpenChangeLeadLocationModalDetail,
} from "@/lib/admin/actions/changeLeadLocationActionClient";
import { CHANGE_LEAD_LOCATION_ACTION_KEY } from "@/lib/admin/actions/changeLeadLocationContract";
import type {
    EnrollmentStatusTransitionScope,
    EnrollmentStatusTransitionSourceSurface,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import { resolveRelationshipActionContext } from "@/lib/admin/relationship/relationshipActionRuntimeContext";
import type {
    RelationshipActionKey,
    RelationshipActionSourceSurface,
} from "@/lib/admin/relationship/relationshipActionContract";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    isAddInquiryChildActionKey,
    isAddInquiryChildFormKey,
    parseOpenAddInquiryChildModalDetail,
    resolveAddInquiryChildMode,
    ADMINV2_OPEN_ADD_INQUIRY_CHILD_MODAL,
} from "@/lib/admin/actions/addInquiryChildActionClient";
import {
    isAddPersonActionKey,
    isAddPersonFormKey,
    narrowedAddPersonOpportunityId,
    parseOpenAddPersonModalDetail,
    resolveAddPersonActionKey,
    ADMINV2_OPEN_ADD_PERSON_MODAL,
} from "@/lib/admin/actions/addPersonActionClient";
import { refreshOpportunityDrawerAfterInquiryChildMutation } from "@/lib/admin/refreshOpportunityDrawerAfterInquiryChildMutation";
import { submitAddInquiryChildFromDrawer } from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";
import { submitAddPersonFromDrawer } from "@/lib/admin/actions/submitAddPersonFromDrawer";
import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import type { ApplyRegistryResolvedActionHost } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import {
    resolveOpportunityRegistryActionErrorMessage,
} from "@/lib/admin/actions/resolveOpportunityRegistryActionFeedbackMessage";
import {
    ADMIN_V2_OPEN_CREATE_WORK_MODAL,
    type OpportunityOpenCreateWorkModalDetail,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import {
    dispatchOpportunityDrawerOperationalTasksRefresh,
    dispatchOpportunityDrawerScopedUpdate,
} from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { patchOpportunityDrawerRecordAfterTourBooking } from "@/lib/admin/opportunityDrawerTourBookingRefresh";
import {
    ADMINV2_OPEN_TOUR_OUTCOME_MODAL,
    ADMINV2_OPEN_TOUR_SCHEDULE_MODAL,
} from "@/lib/tours/actions/tourBookingActionClient";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

type ActionFormState = {
    form_key: string;
    action: ResolvedActionForClient;
};

export type OpportunityDrawerVmRegistryModalHost = {
    patchRecord: (patchFn: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
};

type Params = {
    opportunityId: string | null | undefined;
    record: Record<string, unknown> | null | undefined;
    canMutate: boolean;
    actionHost: OpportunityDrawerVmRegistryModalHost;
    workspaceWorkUnitId?: string | null;
    workspaceDepartmentId?: string | null;
    reloadOpportunityDisplayVm?: () => Promise<void>;
};

function readStringField(record: Record<string, unknown> | null | undefined, key: string): string | null {
    if (!record || typeof record !== "object") return null;
    const v = record[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

type ExecuteResult =
    | { ok: true; execution_result?: Record<string, unknown> }
    | {
          ok: false;
          error: string;
          action_preflight?: ActionPreflightUiPayload;
          completion_requirements?: import("@/lib/completion/requirementValidationTypes").RequirementValidationResult;
      };

async function executeOpportunityHeaderAction(params: {
    opportunityId: string;
    actionKey: string;
    workUnitId?: string | null;
    payload?: Record<string, unknown>;
}): Promise<ExecuteResult> {
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
    const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { execution_result?: Record<string, unknown> };
        error?: {
            message?: string;
            details?: {
                action_preflight?: ActionPreflightUiPayload;
                completion_requirements?: import("@/lib/completion/requirementValidationTypes").RequirementValidationResult;
            };
        };
    };
    if (!res.ok || json.ok === false) {
        return {
            ok: false,
            error: resolveOpportunityRegistryActionErrorMessage(json.error?.message),
            action_preflight: json.error?.details?.action_preflight,
            completion_requirements: json.error?.details?.completion_requirements,
        };
    }
    return { ok: true, execution_result: json.data?.execution_result };
}

/**
 * VM opportunity drawer: registry actions dispatch window events and open_form callbacks
 * that Legacy used to own. Without this host, header Actions menu clicks are silent no-ops.
 */
export function useOpportunityDrawerVmRegistryModals({
    opportunityId,
    record,
    canMutate,
    actionHost,
    workspaceWorkUnitId = null,
    workspaceDepartmentId = null,
    reloadOpportunityDisplayVm,
}: Params): {
    modals: ReactNode;
    registryHostExtensions: Pick<
        ApplyRegistryResolvedActionHost,
        | "openForm"
        | "openCreateWork"
        | "openAddInquiryChild"
        | "openAddPerson"
        | "openRelationshipAction"
        | "openEnrollmentStatus"
        | "openChangeLeadLocation"
    >;
} {
    const oid = opportunityId?.trim() ?? "";
    const { patchRecord } = actionHost;
    const [createWorkOpen, setCreateWorkOpen] = useState(false);
    const [createWorkPrefill, setCreateWorkPrefill] = useState<
        OpportunityOpenCreateWorkModalDetail["prefill"] | undefined
    >(undefined);
    const [sendFormOpen, setSendFormOpen] = useState(false);
    const [launchPacketOpen, setLaunchPacketOpen] = useState(false);
    const [actionFormState, setActionFormState] = useState<ActionFormState | null>(null);
    const [addInquiryChildState, setAddInquiryChildState] = useState<{ mode: "child" | "sibling" } | null>(null);
    const [addPersonState, setAddPersonState] = useState<{ actionKey: string } | null>(null);
    const [relationshipActionState, setRelationshipActionState] = useState<{
        actionKey: RelationshipActionKey;
        sourceSurface: RelationshipActionSourceSurface;
        initialProposal?: Partial<import("@/lib/admin/relationship/relationshipActionContract").RelationshipActionExecutionRequest>;
    } | null>(null);
    const [enrollmentStatusState, setEnrollmentStatusState] = useState<{
        sourceSurface: EnrollmentStatusTransitionSourceSurface;
        initialScope?: Partial<EnrollmentStatusTransitionScope>;
    } | null>(null);
    const [changeLeadLocationOpen, setChangeLeadLocationOpen] = useState(false);
    /**
     * PACKET REVIEW — the action existed, the modal existed, the listener did not.
     *
     * `review_enrollment_packet` is server-gated to appear only when a completed session awaits
     * review, and `applyRegistryResolvedActionClient` dispatches the open event for it. Its only
     * listener lived in the legacy overview body, so for as long as that body has been unreachable
     * the operator has clicked this at exactly the moment it mattered and got nothing — not even an
     * error, because the success toast is deliberately suppressed for this key on the assumption
     * that a modal owns the feedback.
     *
     * It belongs here and nowhere else: it is transient action chrome, like every other modal in
     * this registry, not a record surface.
     */
    const [packetReviewSession, setPacketReviewSession] = useState<PacketReviewSession | null>(null);
    const pendingTourScheduleRef = useRef<{ id: string; action_key?: string } | null>(null);
    const prevOidRef = useRef<string | null>(null);

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

    const openAddInquiryChild = useCallback((mode: "child" | "sibling") => {
        setAddInquiryChildState({ mode });
    }, []);

    const openAddPerson = useCallback((actionKey: string) => {
        setAddPersonState({ actionKey: actionKey.trim() || "add_family_member" });
    }, []);

    const openRelationshipAction = useCallback(
        (input: {
            actionKey: RelationshipActionKey;
            opportunityId: string;
            sourceSurface?: RelationshipActionSourceSurface;
            initialProposal?: Partial<import("@/lib/admin/relationship/relationshipActionContract").RelationshipActionExecutionRequest>;
        }) => {
            if (input.opportunityId.trim() !== oid) return;
            setRelationshipActionState({
                actionKey: input.actionKey,
                sourceSurface: input.sourceSurface ?? "opportunity_drawer",
                initialProposal: input.initialProposal,
            });
        },
        [oid],
    );

    const openEnrollmentStatus = useCallback(
        (input: {
            opportunityId: string;
            sourceSurface?: EnrollmentStatusTransitionSourceSurface;
            initialScope?: Partial<EnrollmentStatusTransitionScope>;
        }) => {
            if (input.opportunityId.trim() !== oid) return;
            setEnrollmentStatusState({
                sourceSurface: input.sourceSurface ?? "opportunity_drawer",
                initialScope: input.initialScope,
            });
        },
        [oid],
    );

    const openChangeLeadLocation = useCallback(
        (input: { opportunityId: string }) => {
            if (input.opportunityId.trim() !== oid) return;
            setChangeLeadLocationOpen(true);
        },
        [oid],
    );

    const openPacketReview = useCallback(
        (requestedOpportunityId: string) => {
            const id = requestedOpportunityId.trim();
            if (!id || id !== oid) return;
            // Read at open time rather than holding a list: the gate that made the action visible
            // ran server-side against a different read, and an operator may sit on this panel for a
            // while. Opening on a stale session would review the wrong packet.
            void fetchPacketReviewSessions(id)
                .then((sessions) => {
                    const pending = resolvePendingPacketReviewSession(sessions);
                    if (pending) setPacketReviewSession(pending);
                })
                .catch(() => {
                    // The action's own failure path owns operator messaging; opening an empty modal
                    // would claim there is something to review.
                });
        },
        [oid],
    );

    const openForm = useCallback(
        (opts: { form_key: string; action: ResolvedActionForClient }) => {
            if (!oid) return;
            const formKey = opts.form_key.trim();
            const actionKey = opts.action.key.trim();
            if (
                actionKey === "create_task"
                || actionKey === "create_work_item"
                || formKey === "create_task"
                || formKey === "create_work_item"
            ) {
                openCreateWorkDirect({ opportunity_id: oid });
                return;
            }
            if (isAddPersonFormKey(formKey) || isAddPersonActionKey(actionKey)) {
                openAddPerson(resolveAddPersonActionKey({ actionKey, formKey }));
                return;
            }
            if (isAddInquiryChildFormKey(formKey) || isAddInquiryChildActionKey(actionKey)) {
                if (actionKey === "add_child") {
                    openRelationshipAction({
                        actionKey: "add_child",
                        opportunityId: oid,
                        sourceSurface: "opportunity_drawer",
                    });
                    return;
                }
                const p =
                    opts.action.payload && typeof opts.action.payload === "object"
                        ? (opts.action.payload as Record<string, unknown>)
                        : {};
                openAddInquiryChild(
                    resolveAddInquiryChildMode({
                        actionKey,
                        payloadMode: p.mode != null ? String(p.mode) : null,
                    }),
                );
                return;
            }
            setActionFormState({ form_key: formKey, action: opts.action });
        },
        [oid, openAddInquiryChild, openAddPerson, openCreateWorkDirect, openRelationshipAction],
    );

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

        const onOpenAddInquiryChild = (ev: Event) => {
            const detail = parseOpenAddInquiryChildModalDetail(ev);
            if (!detail || !matchesDrawer(detail.opportunity_id)) return;
            openAddInquiryChild(detail.mode);
        };

        const onOpenAddPerson = (ev: Event) => {
            const detail = parseOpenAddPersonModalDetail(ev);
            if (!detail) return;
            const opportunityId = narrowedAddPersonOpportunityId(detail);
            if (!opportunityId || !matchesDrawer(opportunityId)) return;
            openAddPerson(
                resolveAddPersonActionKey({
                    actionKey: detail.action_key,
                    formKey: detail.action_key,
                }),
            );
        };

        const onOpenRelationshipAction = (ev: Event) => {
            const detail = parseOpenRelationshipActionModalDetail(ev);
            if (!detail || !matchesDrawer(detail.opportunity_id)) return;
            openRelationshipAction({
                actionKey: detail.action_key,
                opportunityId: detail.opportunity_id,
                sourceSurface: detail.source_surface,
                initialProposal: detail.initial_proposal,
            });
        };

        const onOpenEnrollmentStatus = (ev: Event) => {
            const detail = parseOpenEnrollmentStatusModalDetail(ev);
            if (!detail || !matchesDrawer(detail.opportunity_id)) return;
            openEnrollmentStatus({
                opportunityId: detail.opportunity_id,
                sourceSurface: detail.source_surface,
                initialScope: detail.scope,
            });
        };

        const onOpenChangeLeadLocation = (ev: Event) => {
            const detail = parseOpenChangeLeadLocationModalDetail(ev);
            if (!detail || !matchesDrawer(detail.opportunity_id)) return;
            openChangeLeadLocation({ opportunityId: detail.opportunity_id });
        };

        const onOpenPacketReview = (ev: Event) => {
            const detail = (ev as CustomEvent<{ opportunity_id?: string }>).detail;
            const id = typeof detail?.opportunity_id === "string" ? detail.opportunity_id.trim() : "";
            if (!id || !matchesDrawer(id)) return;
            openPacketReview(id);
        };

        window.addEventListener(ADMIN_V2_OPEN_CREATE_WORK_MODAL, onOpenCreateWork as EventListener);
        window.addEventListener("adminv2:open-send-form", onOpenSendForm as EventListener);
        window.addEventListener("adminv2:open-enrollment-packet", onOpenEnrollmentPacket as EventListener);
        window.addEventListener(ADMINV2_OPEN_TOUR_SCHEDULE_MODAL, onOpenTourSchedule as EventListener);
        window.addEventListener(ADMINV2_OPEN_TOUR_OUTCOME_MODAL, onOpenTourOutcome as EventListener);
        window.addEventListener(ADMINV2_OPEN_ADD_INQUIRY_CHILD_MODAL, onOpenAddInquiryChild as EventListener);
        window.addEventListener(ADMINV2_OPEN_ADD_PERSON_MODAL, onOpenAddPerson as EventListener);
        window.addEventListener(ADMINV2_OPEN_RELATIONSHIP_ACTION_MODAL, onOpenRelationshipAction as EventListener);
        window.addEventListener(ADMINV2_OPEN_ENROLLMENT_STATUS_MODAL, onOpenEnrollmentStatus as EventListener);
        window.addEventListener(ADMINV2_OPEN_CHANGE_LEAD_LOCATION_MODAL, onOpenChangeLeadLocation as EventListener);
        window.addEventListener(ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW, onOpenPacketReview as EventListener);

        return () => {
            window.removeEventListener(ADMIN_V2_OPEN_CREATE_WORK_MODAL, onOpenCreateWork as EventListener);
            window.removeEventListener("adminv2:open-send-form", onOpenSendForm as EventListener);
            window.removeEventListener("adminv2:open-enrollment-packet", onOpenEnrollmentPacket as EventListener);
            window.removeEventListener(ADMINV2_OPEN_TOUR_SCHEDULE_MODAL, onOpenTourSchedule as EventListener);
            window.removeEventListener(ADMINV2_OPEN_TOUR_OUTCOME_MODAL, onOpenTourOutcome as EventListener);
            window.removeEventListener(ADMINV2_OPEN_ADD_INQUIRY_CHILD_MODAL, onOpenAddInquiryChild as EventListener);
            window.removeEventListener(ADMINV2_OPEN_ADD_PERSON_MODAL, onOpenAddPerson as EventListener);
            window.removeEventListener(ADMINV2_OPEN_RELATIONSHIP_ACTION_MODAL, onOpenRelationshipAction as EventListener);
            window.removeEventListener(ADMINV2_OPEN_ENROLLMENT_STATUS_MODAL, onOpenEnrollmentStatus as EventListener);
            window.removeEventListener(ADMINV2_OPEN_CHANGE_LEAD_LOCATION_MODAL, onOpenChangeLeadLocation as EventListener);
            window.removeEventListener(ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW, onOpenPacketReview as EventListener);
        };
    }, [oid, openAddInquiryChild, openAddPerson, openCreateWorkFromEvent, openRelationshipAction, openEnrollmentStatus, openChangeLeadLocation, openPacketReview]);

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
        const prev = prevOidRef.current;
        prevOidRef.current = oid;
        if (prev != null && prev !== oid) {
            setCreateWorkOpen(false);
            setCreateWorkPrefill(undefined);
            setSendFormOpen(false);
            setLaunchPacketOpen(false);
            setActionFormState(null);
            setAddInquiryChildState(null);
            setAddPersonState(null);
            setRelationshipActionState(null);
            setEnrollmentStatusState(null);
            setPacketReviewSession(null);
            setChangeLeadLocationOpen(false);
        }
    }, [oid]);

    const relationshipActionContext = useMemo(() => {
        if (!relationshipActionState || !record) return null;
        return resolveRelationshipActionContext({
            anchorRecord: record as ProofRuntimeRecord,
            sourceSurface: relationshipActionState.sourceSurface,
        });
    }, [record, relationshipActionState]);

    const entityLabel = readStringField(record, "name");
    const departmentId =
        readStringField(record, "_work_unit_department_id") ?? workspaceDepartmentId?.trim() ?? null;
    const lifecycleStageKey = readStringField(record, "_effective_lifecycle_stage");
    const recordOwnerUserId = readStringField(record, "assigned_to");
    const locationId = readStringField(record, "location_id") ?? readStringField(record, "_location_id");
    const workUnitId =
        readStringField(record, "work_unit_id") ?? workspaceWorkUnitId?.trim() ?? null;
    const metadata =
        record && typeof record.metadata === "object" && record.metadata != null ?
            (record.metadata as Record<string, unknown>)
        :   null;
    const initialTourDate = typeof metadata?.tour_date === "string" ? metadata.tour_date.trim() : null;
    const initialTourTime = typeof metadata?.tour_time === "string" ? metadata.tour_time.trim() : null;

    const applyTourBookingPatch = useCallback(
        (booking: {
            start_at: string;
            timezone: string;
            status_key: string;
            booking_id?: string | null;
            mirror_override?: { tour_date: string; tour_time: string } | null;
        }) => {
            patchRecord((prev) => patchOpportunityDrawerRecordAfterTourBooking(prev, booking));
        },
        [patchRecord]
    );

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
                        onCreated={() => {
                            dispatchOpportunityDrawerOperationalTasksRefresh(oid);
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
                        onSent={() => {
                            dispatchOpportunityDrawerScopedUpdate(oid, "send_form", ["documents", "activity"]);
                        }}
                    />
                :   null}
                {launchPacketOpen ?
                    <OpportunityEnrollmentPacketModal
                        open={launchPacketOpen}
                        opportunityId={oid}
                        opportunityLabel={entityLabel ?? "Opportunity"}
                        opportunityRecord={record ?? null}
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
                    onSlotBooked={async (result) => {
                        const booking = result?.booking;
                        if (booking && typeof booking.start_at === "string" && typeof booking.timezone === "string") {
                            applyTourBookingPatch({
                                start_at: booking.start_at,
                                timezone: booking.timezone,
                                status_key: String(booking.status_key ?? "confirmed"),
                                booking_id: typeof booking.id === "string" ? booking.id : null,
                            });
                        }
                        dispatchOpportunityDrawerScopedUpdate(oid, actionKey || "schedule_tour", [
                            "tour_surfaces",
                            "header_actions",
                        ]);
                    }}
                    onLegacySubmit={async (payload) => {
                        const resolvedActionKey = actionKey || "schedule_tour";
                        const locId = locationId ?? "";
                        if (locId) {
                            const res = await fetch("/api/admin/tours/bookings", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    opportunity_id: oid,
                                    location_id: locId,
                                    tour_date: payload.tour_date,
                                    tour_time: payload.tour_time,
                                }),
                            });
                            const json = (await res.json().catch(() => ({}))) as {
                                booking?: TourBookingRow;
                                error?: string;
                            };
                            if (!res.ok) {
                                throw new Error(json.error ?? "Failed to schedule tour");
                            }
                            const booking = json.booking;
                            if (
                                booking &&
                                typeof booking.start_at === "string" &&
                                typeof booking.timezone === "string"
                            ) {
                                applyTourBookingPatch({
                                    start_at: booking.start_at,
                                    timezone: booking.timezone,
                                    status_key: String(booking.status_key ?? "confirmed"),
                                    booking_id: typeof booking.id === "string" ? booking.id : null,
                                    mirror_override: {
                                        tour_date: payload.tour_date,
                                        tour_time: payload.tour_time,
                                    },
                                });
                            }
                            dispatchOpportunityDrawerScopedUpdate(oid, resolvedActionKey, [
                                "tour_surfaces",
                                "header_actions",
                            ]);
                            return;
                        }

                        const result = await executeOpportunityHeaderAction({
                            opportunityId: oid,
                            actionKey: resolvedActionKey,
                            workUnitId,
                            payload,
                        });
                        if (!result.ok) {
                            throw new Error(result.error);
                        }
                        dispatchOpportunityDrawerScopedUpdate(oid, resolvedActionKey, [
                            "tour_surfaces",
                            "header_actions",
                        ]);
                    }}
                />
                <RecordTourOutcomeModal
                    open={actionFormState?.form_key === "record_tour_outcome"}
                    onClose={() => setActionFormState(null)}
                    title={actionFormState?.action?.label ?? "Record tour outcome"}
                    onSubmit={async (payload) => {
                        const resolvedActionKey = actionKey || "record_tour_outcome";
                        const result = await executeOpportunityHeaderAction({
                            opportunityId: oid,
                            actionKey: resolvedActionKey,
                            workUnitId,
                            payload: { outcome: payload.outcome },
                        });
                        if (!result.ok) {
                            throw new Error(result.error);
                        }
                        dispatchOpportunityDrawerScopedUpdate(oid, resolvedActionKey, [
                            "tour_surfaces",
                            "header_actions",
                            "activity",
                        ]);
                    }}
                />
                <AddNoteModal
                    open={actionFormState?.form_key === "add_note"}
                    onClose={() => setActionFormState(null)}
                    title={actionFormState?.action?.label ?? "Add note"}
                    onSubmit={async (payload) => {
                        const resolvedActionKey = actionKey || "add_note";
                        const result = await executeOpportunityHeaderAction({
                            opportunityId: oid,
                            actionKey: resolvedActionKey,
                            workUnitId,
                            payload,
                        });
                        if (!result.ok) {
                            throw new Error(result.error);
                        }
                        dispatchOpportunityDrawerScopedUpdate(oid, resolvedActionKey, ["activity"]);
                    }}
                />
                <AddPersonModal
                    open={!!addPersonState}
                    title="Add person"
                    defaultRoleType={
                        addPersonState?.actionKey === "add_related_person" ? "primary_contact" : "parent"
                    }
                    onClose={() => setAddPersonState(null)}
                    onSubmit={async (payload) => {
                        if (!oid) throw new Error("Open an opportunity record before adding a person.");
                        const actionKey = addPersonState?.actionKey ?? "add_family_member";
                        await submitAddPersonFromDrawer({
                            entityType: "opportunity",
                            entityId: oid,
                            actionKey,
                            payload,
                            context: {
                                surface: "record_header",
                                section_key: "family_contacts",
                                department_id: departmentId,
                                work_unit_id: workUnitId,
                            },
                        });
                        setAddPersonState(null);
                        dispatchOpportunityDrawerScopedUpdate(oid, actionKey, [
                            "header_actions",
                            "activity",
                        ]);
                    }}
                />
                <AddInquiryChildModal
                    open={!!addInquiryChildState}
                    mode={addInquiryChildState?.mode ?? "child"}
                    defaultLocationId={locationId}
                    onClose={() => setAddInquiryChildState(null)}
                    onSubmit={async (payload) => {
                        if (!oid) throw new Error("Open an opportunity record before adding a child.");
                        const customerId = readStringField(record, "customer_id");
                        if (!customerId) {
                            throw new Error(
                                "This inquiry is not linked to a household yet. Add a primary contact first.",
                            );
                        }
                        const existingRaw = (record?._inquiry_children as unknown[]) ?? [];
                        const existingChildren = mapRawInquiryChildrenToDrawerRows(existingRaw).map((row) => ({
                            first_name: row.first_name,
                            last_name: row.last_name,
                            dob: row.dob,
                        }));
                        const mode = addInquiryChildState?.mode ?? "child";
                        const actionKey = mode === "sibling" ? "add_sibling" : "add_child";
                        const result = await submitAddInquiryChildFromDrawer({
                            opportunityId: oid,
                            customerId,
                            payload,
                            opportunityLocationId: locationId,
                            existingChildren,
                        });
                        setAddInquiryChildState(null);
                        await refreshOpportunityDrawerAfterInquiryChildMutation({
                            opportunityId: oid,
                            workspaceContext:
                                departmentId && workUnitId ?
                                    { department_id: departmentId, work_unit_id: workUnitId }
                                :   null,
                            customerMemberId: result.customer_member_id,
                            ocmId: result.ocm_id,
                            patchRecord: actionHost.patchRecord,
                            reloadDisplayVm: reloadOpportunityDisplayVm,
                        });
                        dispatchOpportunityDrawerScopedUpdate(oid, actionKey, [
                            "header_actions",
                            "activity",
                        ]);
                    }}
                />
                {relationshipActionState && relationshipActionContext && record ?
                    <RelationshipActionGuidedModal
                        open
                        actionKey={relationshipActionState.actionKey}
                        context={relationshipActionContext}
                        anchorRecord={record as ProofRuntimeRecord}
                        initialProposal={relationshipActionState.initialProposal}
                        onClose={() => setRelationshipActionState(null)}
                        onSuccess={() => {
                            dispatchOpportunityDrawerScopedUpdate(oid, relationshipActionState.actionKey, [
                                "header_actions",
                                "activity",
                            ]);
                            void reloadOpportunityDisplayVm?.();
                        }}
                    />
                :   null}
                {enrollmentStatusState ?
                    <ChangeEnrollmentStatusModal
                        open
                        opportunityId={oid}
                        sourceSurface={enrollmentStatusState.sourceSurface}
                        initialScope={enrollmentStatusState.initialScope}
                        departmentId={departmentId}
                        workUnitId={workUnitId}
                        onClose={() => setEnrollmentStatusState(null)}
                        onSuccess={() => {
                            dispatchOpportunityDrawerScopedUpdate(oid, "update_enrollment_status", [
                                "header_actions",
                                "activity",
                            ]);
                            void reloadOpportunityDisplayVm?.();
                        }}
                    />
                :   null}
                {changeLeadLocationOpen ?
                    <ChangeLeadLocationModal
                        open
                        opportunityId={oid}
                        record={record}
                        onClose={() => setChangeLeadLocationOpen(false)}
                        onSuccess={(nextRecord) => {
                            if (nextRecord) {
                                patchRecord(() => nextRecord);
                            }
                            dispatchOpportunityDrawerScopedUpdate(oid, CHANGE_LEAD_LOCATION_ACTION_KEY, [
                                "header_actions",
                                "activity",
                            ]);
                            void reloadOpportunityDisplayVm?.();
                        }}
                    />
                :   null}
                <OpportunityPacketReviewModal
                    open={packetReviewSession != null}
                    session={packetReviewSession}
                    canMutate={canMutate}
                    onClose={() => setPacketReviewSession(null)}
                    onReviewApplied={() => {
                        setPacketReviewSession(null);
                        // Reviewing a packet changes what the operator is looking at in three
                        // places: the action's own eligibility (the gate re-runs and may withdraw
                        // it), readiness, and the record's activity.
                        dispatchOpportunityDrawerScopedUpdate(oid, "review_enrollment_packet", [
                            "header_actions",
                            "documents",
                            "activity",
                        ]);
                        void reloadOpportunityDisplayVm?.();
                    }}
                />
            </>
        );
    }, [
        packetReviewSession,
        actionFormState,
        addInquiryChildState,
        addPersonState,
        actionHost.patchRecord,
        applyTourBookingPatch,
        canMutate,
        changeLeadLocationOpen,
        createWorkOpen,
        createWorkPrefill,
        departmentId,
        entityLabel,
        initialTourDate,
        initialTourTime,
        launchPacketOpen,
        lifecycleStageKey,
        locationId,
        oid,
        patchRecord,
        record,
        recordOwnerUserId,
        relationshipActionContext,
        relationshipActionState,
        enrollmentStatusState,
        reloadOpportunityDisplayVm,
        sendFormOpen,
        workUnitId,
    ]);

    const registryHostExtensions = useMemo(
        () => ({
            openForm,
            openCreateWork: openCreateWorkDirect,
            openAddInquiryChild,
            openAddPerson,
            openRelationshipAction,
            openEnrollmentStatus,
            openChangeLeadLocation,
        }),
        [
            openAddInquiryChild,
            openAddPerson,
            openCreateWorkDirect,
            openForm,
            openRelationshipAction,
            openEnrollmentStatus,
            openChangeLeadLocation,
        ],
    );

    return { modals, registryHostExtensions };
}
