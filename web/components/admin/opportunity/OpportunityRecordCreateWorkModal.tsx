"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminAuth } from "@/contexts/AdminAuthContext";
import OperationalWorkAssigneeSelect from "@/components/admin/opportunity/OperationalWorkAssigneeSelect";
import {
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
    type OpportunityOperationalTasksRefreshDetail,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import {
    defaultOperationalWorkDueLocal,
    minOperationalWorkDatetimeLocalValue,
} from "@/lib/admin/operationalWork/operationalWorkDateTimeLocal";
import {
    buildCreateWorkModalDefinitionOptions,
    CREATE_WORK_AD_HOC_OPTION_KEY,
    resolveCreateWorkModalDefinitionPrefill,
} from "@/lib/admin/operationalWork/createWorkModalDefinitionPicker";
import {
    MESSAGING_MODAL_BODY_CLASS,
    MESSAGING_MODAL_HEADER_CLASS,
    MESSAGING_MODAL_PANEL_CLASS,
    MESSAGING_MODAL_PRIMARY_BUTTON_CLASS,
    MESSAGING_MODAL_SECONDARY_BUTTON_CLASS,
} from "@/lib/adminV2/messaging/messagingComposerModalChrome";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import {
    buildOperationalTaskBody,
    createOperationalTask,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { ActionModalStatusMessage } from "@/components/admin/opportunity/actions/ActionModalStatusMessage";

const CREATE_WORK_SUCCESS_DISMISS_MS = 2000;

export type OpportunityRecordCreateWorkModalPrefill = {
    title?: string | null;
    description?: string | null;
    due_local?: string | null;
};

export type OpportunityRecordCreateWorkModalProps = {
    open: boolean;
    onClose: () => void;
    opportunityId: string;
    entityLabel?: string | null;
    prefill?: OpportunityRecordCreateWorkModalPrefill | null;
    lifecycleStageKey?: string | null;
    recordOwnerUserId?: string | null;
    departmentMetadata?: Record<string, unknown> | null;
    onCreated?: () => void;
};

export default function OpportunityRecordCreateWorkModal({
    open,
    onClose,
    opportunityId,
    entityLabel = null,
    prefill = null,
    lifecycleStageKey = null,
    recordOwnerUserId = null,
    departmentMetadata = null,
    onCreated,
}: OpportunityRecordCreateWorkModalProps) {
    const { userId } = useAdminAuth();
    const [workTypeKey, setWorkTypeKey] = useState<string>(CREATE_WORK_AD_HOC_OPTION_KEY);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueLocal, setDueLocal] = useState(defaultOperationalWorkDueLocal);
    const [assignedToUserId, setAssignedToUserId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const resolveParams = useMemo(
        () => ({
            stageKey: lifecycleStageKey?.trim() || undefined,
            departmentMetadata,
        }),
        [departmentMetadata, lifecycleStageKey],
    );

    const workTypeOptions = useMemo(
        () => buildCreateWorkModalDefinitionOptions({ resolveParams }),
        [resolveParams],
    );

    const applyDefinitionPrefill = useCallback(
        (selectedKey: string) => {
            const uid = userId?.trim() || "";
            const prefillFields = resolveCreateWorkModalDefinitionPrefill({
                workDefinitionKey: selectedKey,
                userId: uid,
                recordOwnerUserId,
                resolveParams,
            });
            setTitle(prefillFields.title);
            setDueLocal(prefillFields.dueLocal);
            setAssignedToUserId(prefillFields.assignedToUserId);
        },
        [recordOwnerUserId, resolveParams, userId],
    );

    useEffect(() => {
        if (!open) return;
        const initialKey = CREATE_WORK_AD_HOC_OPTION_KEY;
        setWorkTypeKey(initialKey);
        setDescription(prefill?.description?.trim() ?? "");
        setBusy(false);
        setError(null);
        setInfoMessage(null);
        setSuccessMessage(null);

        const hasPrefillTitle = Boolean(prefill?.title?.trim());
        if (hasPrefillTitle) {
            setTitle(prefill?.title?.trim() ?? "");
            setDueLocal(prefill?.due_local?.trim() || defaultOperationalWorkDueLocal());
            setAssignedToUserId(userId?.trim() || null);
            return;
        }

        applyDefinitionPrefill(initialKey);
    }, [applyDefinitionPrefill, open, prefill?.description, prefill?.due_local, prefill?.title, userId]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [busy, onClose, open]);

    const dispatchRefresh = useCallback(() => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
            new CustomEvent<OpportunityOperationalTasksRefreshDetail>(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, {
                detail: { opportunity_id: opportunityId },
            })
        );
    }, [opportunityId]);

    const onWorkTypeChange = useCallback(
        (nextKey: string) => {
            setWorkTypeKey(nextKey);
            setError(null);
            setInfoMessage(null);
            applyDefinitionPrefill(nextKey);
        },
        [applyDefinitionPrefill],
    );

    const onSubmit = useCallback(async () => {
        const trimmedTitle = title.trim();
        if (!trimmedTitle || !dueLocal.trim()) return;
        setBusy(true);
        setError(null);
        setInfoMessage(null);
        try {
            const isAdHoc = workTypeKey === CREATE_WORK_AD_HOC_OPTION_KEY;
            const body = buildOperationalTaskBody({
                entityId: opportunityId,
                title: trimmedTitle,
                dueAtIso: new Date(dueLocal).toISOString(),
                description: description.trim() || null,
                source: "manual",
                proposalId: null,
                assignedToUserId,
                workDefinitionKey: isAdHoc ? null : workTypeKey,
            });
            const res = await createOperationalTask(body);
            const json = await readJson<{
                ok?: boolean;
                error?: string;
                message?: string;
                instantiate?: { status?: string };
            }>(res);
            if (!res.ok || !json.ok) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            dispatchRefresh();
            if (json.instantiate?.status === "deduped") {
                setInfoMessage("Open work already exists for this type — the list has been refreshed.");
                onCreated?.();
                return;
            }
            setSuccessMessage("Task created.");
            onCreated?.();
            window.setTimeout(() => onClose(), CREATE_WORK_SUCCESS_DISMISS_MS);
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setBusy(false);
        }
    }, [assignedToUserId, description, dispatchRefresh, dueLocal, onClose, onCreated, opportunityId, title, workTypeKey]);

    if (!open) return null;

    const recordHint = entityLabel?.trim() || "this record";
    const canSubmit = Boolean(title.trim() && dueLocal.trim()) && !successMessage;

    return (
        <div
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 p-4"
            role="presentation"
            data-operational-work-create-modal-backdrop="true"
            onClick={() => {
                if (!busy) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="operational-work-create-title"
                className={`${MESSAGING_MODAL_PANEL_CLASS} w-full max-w-md`}
                data-operational-work-create-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={MESSAGING_MODAL_HEADER_CLASS}>
                    <div>
                        <h2 id="operational-work-create-title" className="text-[15px] font-semibold text-alloy-midnight">
                            Create work
                        </h2>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/55">For {recordHint}</p>
                    </div>
                </div>
                <div className={`${MESSAGING_MODAL_BODY_CLASS} space-y-3`}>
                    {successMessage ?
                        <>
                            <ActionModalStatusMessage type="success" message={successMessage} />
                            <div className="flex flex-wrap justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    className={MESSAGING_MODAL_SECONDARY_BUTTON_CLASS}
                                    onClick={onClose}
                                >
                                    Close
                                </button>
                            </div>
                        </>
                    :   <>
                    <div>
                        <label
                            htmlFor="operational-work-create-type"
                            className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                        >
                            Type of work
                        </label>
                        <select
                            id="operational-work-create-type"
                            value={workTypeKey}
                            disabled={busy}
                            onChange={(e) => onWorkTypeChange(e.target.value)}
                            className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[13px] bg-white"
                            data-operational-work-create-type="true"
                        >
                            {workTypeOptions.map((option) => (
                                <option key={option.key} value={option.key}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label
                            htmlFor="operational-work-create-title-input"
                            className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                        >
                            What needs to happen?
                        </label>
                        <input
                            id="operational-work-create-title-input"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Add follow-up"
                            autoFocus
                            className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[13px]"
                            data-operational-work-create-title="true"
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="operational-work-create-description"
                            className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                        >
                            Details (optional)
                        </label>
                        <textarea
                            id="operational-work-create-description"
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Notes for yourself or the team"
                            className="w-full resize-y rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[12px]"
                            data-operational-work-create-description="true"
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="operational-work-create-due"
                            className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                        >
                            Due date & time
                        </label>
                        <input
                            id="operational-work-create-due"
                            type="datetime-local"
                            value={dueLocal}
                            min={minOperationalWorkDatetimeLocalValue()}
                            onChange={(e) => setDueLocal(e.target.value)}
                            className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[13px]"
                            data-operational-work-create-due="true"
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="operational-work-create-assignee"
                            className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                        >
                            Assigned to
                        </label>
                        <OperationalWorkAssigneeSelect
                            id="operational-work-create-assignee"
                            value={assignedToUserId}
                            currentUserId={userId}
                            disabled={busy}
                            onChange={setAssignedToUserId}
                        />
                    </div>
                    {infoMessage ?
                        <ActionModalStatusMessage type="info" message={infoMessage} />
                    :   null}
                    {error ?
                        <ActionModalStatusMessage type="error" message={error} />
                    :   null}
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                        <button
                            type="button"
                            className={MESSAGING_MODAL_SECONDARY_BUTTON_CLASS}
                            disabled={busy}
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className={MESSAGING_MODAL_PRIMARY_BUTTON_CLASS}
                            disabled={busy || !canSubmit}
                            data-operational-work-create-submit="true"
                            onClick={() => void onSubmit()}
                        >
                            {busy ? "Creating…" : "Create work"}
                        </button>
                    </div>
                        </>
                    }
                </div>
            </div>
        </div>
    );
}
