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
                : preview ?
                    <>
                        <p>This action will remove:</p>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
                            <dt className="text-alloy-midnight/55">Opportunity</dt>
                            <dd>{preview.counts.opportunities}</dd>
                            <dt className="text-alloy-midnight/55">Enrollment Records</dt>
                            <dd>{preview.counts.enrollment_records}</dd>
                            <dt className="text-alloy-midnight/55">Parents</dt>
                            <dd>{preview.counts.parents}</dd>
                            <dt className="text-alloy-midnight/55">Children</dt>
                            <dd>{preview.counts.children}</dd>
                            <dt className="text-alloy-midnight/55">Customer Members</dt>
                            <dd>{preview.counts.customer_members}</dd>
                            <dt className="text-alloy-midnight/55">Customer</dt>
                            <dd>{preview.counts.customers}</dd>
                        </dl>
                        <p className="text-[12px] text-alloy-midnight/55">
                            Only records with no remaining references will be deleted.
                        </p>
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
                    disabled={busy || !preview || preview.blocked}
                    onClick={() => void onDelete()}
                >
                    {deleting ? "Deleting…" : "Delete"}
                </button>
            </div>
        </ActionModalOverlayShell>
    );
}
