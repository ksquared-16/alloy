"use client";

import clsx from "clsx";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import {
    isPacketReviewAwaitingDecision,
    operatorReviewStatusLabel,
} from "@/lib/forms/review/formsReviewPresentation";
import { CaseFileReviewActions } from "@/components/forms/review/CaseFileReviewActions";

type Props = {
    rollup: PacketReviewRollupV1;
    notes: string;
    saving: boolean;
    saveErr: string | null;
    canMutate: boolean;
    variant?: "page" | "modal";
    onNotesChange: (value: string) => void;
    onApplyReview: (status: "approved" | "rejected" | "needs_correction") => void;
};

const btnSecondaryPage =
    "rounded-md border border-admin-border px-3 py-2 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/30 disabled:opacity-40";
const btnRejectPage =
    "rounded-md border border-alloy-ember/40 bg-white px-3 py-2 text-xs font-semibold text-alloy-ember hover:bg-alloy-ember/5 disabled:opacity-40";
const btnApprovePage =
    "rounded-md bg-alloy-blue px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40";

const btnSecondaryModal =
    "rounded border border-alloy-stone/40 px-3 py-1.5 text-xs font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10 disabled:opacity-40";
const btnRejectModal =
    "rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-40";
const btnApproveModal = "rounded bg-alloy-blue px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40";

export function PacketReviewActionsForm({
    rollup,
    notes,
    saving,
    saveErr,
    canMutate,
    variant = "page",
    onNotesChange,
    onApplyReview,
}: Props) {
    const awaiting = isPacketReviewAwaitingDecision(rollup.status, rollup.operator_review.status);
    const modal = variant === "modal";
    const btnSecondary = modal ? btnSecondaryModal : btnSecondaryPage;
    const btnReject = modal ? btnRejectModal : btnRejectPage;
    const btnApprove = modal ? btnApproveModal : btnApprovePage;
    const textareaClass = modal ?
        "mt-1 block w-full rounded border border-alloy-stone/35 px-2 py-1 text-xs text-alloy-midnight"
    :   "mt-1 block w-full rounded-md border border-admin-border px-2 py-1.5 text-sm text-alloy-midnight";

    return (
        <CaseFileReviewActions variant={variant}>
            {awaiting ?
                <>
                    <label className="block text-xs font-medium text-alloy-midnight/75">
                        Notes (optional)
                        <textarea
                            className={textareaClass}
                            rows={2}
                            value={notes}
                            disabled={!canMutate || saving}
                            onChange={(e) => onNotesChange(e.target.value)}
                        />
                    </label>
                    {saveErr ?
                        <p className="mt-2 text-xs text-alloy-ember" role="alert">
                            {saveErr}
                        </p>
                    : null}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            className={btnSecondary}
                            disabled={!canMutate || saving}
                            onClick={() => onApplyReview("needs_correction")}
                        >
                            Needs correction
                        </button>
                        <button
                            type="button"
                            className={btnReject}
                            disabled={!canMutate || saving}
                            onClick={() => onApplyReview("rejected")}
                        >
                            Reject
                        </button>
                        <button
                            type="button"
                            className={btnApprove}
                            disabled={!canMutate || saving}
                            onClick={() => onApplyReview("approved")}
                        >
                            {saving ? "Saving…" : "Approve"}
                        </button>
                    </div>
                </>
            :   <p className="text-sm text-alloy-midnight/75">
                    Decision recorded:{" "}
                    <span className="font-medium text-alloy-midnight">
                        {operatorReviewStatusLabel(rollup.operator_review.status)}
                    </span>
                    {rollup.operator_review.reviewed_at ?
                        <span className="text-alloy-midnight/55">
                            {" "}
                            · {new Date(rollup.operator_review.reviewed_at).toLocaleString()}
                        </span>
                    : null}
                </p>
            }
        </CaseFileReviewActions>
    );
}
