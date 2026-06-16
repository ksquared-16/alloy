"use client";

import { useCallback, useEffect, useState } from "react";

import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";
import type { OpportunityLeadDeletionPreview } from "@/lib/admin/opportunity/deleteOpportunityLead";

type Props = {
    open: boolean;
    opportunityId: string;
    leadSingular?: string;
    onClose: () => void;
    onDeleted: () => void;
};

type PreviewState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; preview: OpportunityLeadDeletionPreview };

function PreviewCountRow({ label, count }: { label: string; count: number }) {
    if (count <= 0) return null;
    return (
        <>
            <dt className="text-alloy-midnight/55">{label}</dt>
            <dd>{count}</dd>
        </>
    );
}

export function DeleteLeadModal({
    open,
    opportunityId,
    leadSingular = "Lead",
    onClose,
    onDeleted,
}: Props) {
    const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const loadPreview = useCallback(async () => {
        setPreviewState({ status: "loading" });
        setDeleteError(null);
        try {
            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/delete-preview`, {
                method: "GET",
                credentials: "include",
            });
            const body = (await res.json().catch(() => null)) as
                | { preview?: OpportunityLeadDeletionPreview; error?: string }
                | null;
            if (!res.ok) {
                setPreviewState({
                    status: "error",
                    message: body?.error?.trim() || "Could not load deletion preview.",
                });
                return;
            }
            if (!body?.preview) {
                setPreviewState({ status: "error", message: "Deletion preview unavailable." });
                return;
            }
            setPreviewState({ status: "ready", preview: body.preview });
        } catch {
            setPreviewState({ status: "error", message: "Could not load deletion preview." });
        }
    }, [opportunityId]);

    useEffect(() => {
        if (!open) {
            setPreviewState({ status: "idle" });
            setDeleteError(null);
            setDeleting(false);
            return;
        }
        void loadPreview();
    }, [open, loadPreview]);

    const onDelete = async () => {
        if (previewState.status !== "ready" || previewState.preview.blocked) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/delete`, {
                method: "POST",
                credentials: "include",
            });
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
                setDeleteError(body?.error?.trim() || "Delete failed.");
                setDeleting(false);
                return;
            }
            onDeleted();
        } catch {
            setDeleteError("Delete failed.");
            setDeleting(false);
        }
    };

    const preview = previewState.status === "ready" ? previewState.preview : null;
    const busy = deleting || previewState.status === "loading";
    const deleteDisabled = busy || !preview || preview.blocked;
    const deleteDisabledReason =
        preview?.blocked && preview.block_reason ?
            preview.block_reason
        : previewState.status === "error" ?
            previewState.message
        :   null;
    const willDelete = preview?.will_delete;
    const willRetain = preview?.will_retain;
    const hasRetained =
        (willRetain?.customers ?? 0) > 0 ||
        (willRetain?.persons ?? 0) > 0 ||
        (willRetain?.customer_members ?? 0) > 0;

    return (
        <ActionModalOverlayShell
            open={open}
            onClose={onClose}
            busy={busy}
            panelClassName="w-full max-w-lg overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl"
            data-testid="delete-lead-modal"
        >
            <div className="border-b border-alloy-stone/15 px-5 py-4">
                <h2 className="text-[15px] font-semibold text-alloy-midnight">Delete {leadSingular}</h2>
                {preview?.opportunity_name ?
                    <p className="mt-1 text-[12px] text-alloy-midnight/55">{preview.opportunity_name}</p>
                :   null}
            </div>

            <div className="space-y-4 px-5 py-4 text-[13px] text-alloy-midnight/80">
                {previewState.status === "loading" ?
                    <p className="text-alloy-midnight/55">Loading preview…</p>
                : previewState.status === "error" ?
                    <p className="text-red-700">{previewState.message}</p>
                : preview && willDelete ?
                    <>
                        <p>This action will permanently remove:</p>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
                            <PreviewCountRow label="Opportunity" count={willDelete.opportunities} />
                            <PreviewCountRow label="Enrollment records" count={willDelete.enrollment_records} />
                            <PreviewCountRow label="Household / customer" count={willDelete.customers} />
                            <PreviewCountRow label="Adults" count={willDelete.adults} />
                            <PreviewCountRow label="Children" count={willDelete.children} />
                            <PreviewCountRow label="Customer members" count={willDelete.customer_members} />
                            <PreviewCountRow label="Tasks" count={willDelete.tasks} />
                            <PreviewCountRow label="Communication threads" count={willDelete.communication_threads} />
                            <PreviewCountRow label="Messages" count={willDelete.communication_messages} />
                            <PreviewCountRow label="Scheduled sends" count={willDelete.communication_scheduled_sends} />
                            <PreviewCountRow label="Documents" count={willDelete.documents} />
                            <PreviewCountRow label="Form submissions" count={willDelete.form_submissions} />
                            <PreviewCountRow label="Field values" count={willDelete.field_values} />
                            <PreviewCountRow label="Placement candidates" count={willDelete.placement_candidates} />
                        </dl>
                        {hasRetained ?
                            <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-3 py-2 text-[12px] text-alloy-midnight/70">
                                <p className="font-medium text-alloy-midnight/80">Will keep (shared elsewhere)</p>
                                <ul className="mt-1 list-inside list-disc">
                                    {willRetain!.customers > 0 ?
                                        <li>{willRetain!.customers} household/customer</li>
                                    :   null}
                                    {willRetain!.persons > 0 ?
                                        <li>{willRetain!.persons} person(s)</li>
                                    :   null}
                                    {willRetain!.customer_members > 0 ?
                                        <li>{willRetain!.customer_members} customer member(s)</li>
                                    :   null}
                                </ul>
                            </div>
                        :   null}
                        {preview.blocked && preview.block_reason ?
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                                {preview.block_reason}
                            </p>
                        :   null}
                        {deleteError ?
                            <p className="text-[12px] text-red-700">{deleteError}</p>
                        :   null}
                    </>
                :   null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4">
                <button
                    type="button"
                    className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                    disabled={busy}
                    onClick={onClose}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={deleteDisabled}
                    title={deleteDisabledReason ?? undefined}
                    onClick={() => void onDelete()}
                >
                    {deleting ? "Deleting…" : preview?.blocked ? "Cannot delete" : "Delete"}
                </button>
            </div>
        </ActionModalOverlayShell>
    );
}
