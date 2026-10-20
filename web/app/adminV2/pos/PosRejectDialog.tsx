"use client";

/**
 * "Reject / Do not create" — the operator's reason, then the case closes as rejected. Nothing canonical
 * is created; the case stays findable in Completed with its evidence and reason.
 */
import { useState } from "react";

import { resolveOutcomeReasons } from "@/lib/pos/decisionOutcomes";
import ProcessingAlloyDialog from "./ProcessingAlloyDialog";

export default function PosRejectDialog({
    onClose,
    onReject,
    busy,
    error,
}: {
    onClose: () => void;
    onReject: (reasonCode: string, note: string | null) => void;
    busy: boolean;
    error: string | null;
}) {
    const reasons = resolveOutcomeReasons("rejected");
    const [reason, setReason] = useState<string>("");
    const [note, setNote] = useState("");
    const needsNote = reason === "other" && !note.trim();
    return (
        <ProcessingAlloyDialog
            open
            onClose={onClose}
            title="Reject this intake?"
            subtitle="No family, child or lead will be created. The submission is kept and the case moves to Completed as Rejected."
            testId="processing-reject"
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70">
                        Keep reviewing
                    </button>
                    <button
                        type="button"
                        disabled={busy || !reason || needsNote}
                        onClick={() => onReject(reason, note.trim() || null)}
                        data-testid="processing-reject-confirm"
                        className="rounded-lg bg-rose-600 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                        {busy ? "Rejecting…" : "Reject — do not create"}
                    </button>
                </>
            }
        >
            <fieldset className="space-y-1.5">
                <legend className="mb-1 text-[12px] font-medium text-alloy-midnight/70">Why?</legend>
                {reasons.map((r) => (
                    <label key={r.code} className="flex items-center gap-2 text-[12.5px] text-alloy-midnight">
                        <input type="radio" name="reject-reason" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} data-testid={`reject-reason-${r.code}`} />
                        {r.label}
                    </label>
                ))}
            </fieldset>
            <label className="mt-3 block text-[12px] text-alloy-midnight/70">
                Note {reason === "other" ? "(required)" : "(optional)"}
                <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-alloy-stone/25 px-2 py-1.5 text-[12.5px]"
                    data-testid="reject-note"
                />
            </label>
            {error ? <p className="mt-2 text-[12px] text-rose-700" role="alert">{error}</p> : null}
        </ProcessingAlloyDialog>
    );
}
