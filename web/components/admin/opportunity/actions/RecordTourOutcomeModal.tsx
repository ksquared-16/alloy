"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionModalStatusMessage } from "@/components/admin/opportunity/actions/ActionModalStatusMessage";

export type TourOutcomeChoice = "completed" | "no_show";

const SUCCESS_DISMISS_MS = 2000;

export function RecordTourOutcomeModal(props: {
    open: boolean;
    title?: string;
    onClose: () => void;
    onSubmit: (payload: { outcome: TourOutcomeChoice }) => Promise<void>;
}) {
    const { open, title = "Record tour outcome", onClose, onSubmit } = props;
    const [outcome, setOutcome] = useState<TourOutcomeChoice | "">("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setOutcome("");
        setError(null);
        setBusy(false);
        setSuccessMessage(null);
    }, [open]);

    const canSubmit = useMemo(() => !busy && outcome !== "" && !successMessage, [busy, outcome, successMessage]);

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold tracking-wide text-alloy-forge/50";

    if (!open) return null;

    return (
        <>
            <div className={overlay} onClick={() => (!busy && !successMessage ? onClose() : null)} />
            <div className={panel} role="dialog" aria-modal="true" aria-label={title}>
                <div className="flex items-start justify-between gap-3 border-b border-alloy-stone/15 px-5 py-4">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            Mark how the scheduled tour ended.
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-3 px-5 py-4">
                    {successMessage ?
                        <ActionModalStatusMessage type="success" message={successMessage} />
                    :   <div>
                            <div className={label}>Outcome</div>
                            <div className="mt-1 flex flex-col gap-2">
                                <label className="flex cursor-pointer items-center gap-2 text-sm text-alloy-midnight">
                                    <input
                                        type="radio"
                                        name="tour_outcome"
                                        disabled={busy}
                                        checked={outcome === "completed"}
                                        onChange={() => setOutcome("completed")}
                                    />
                                    Tour completed — family attended
                                </label>
                                <label className="flex cursor-pointer items-center gap-2 text-sm text-alloy-midnight">
                                    <input
                                        type="radio"
                                        name="tour_outcome"
                                        disabled={busy}
                                        checked={outcome === "no_show"}
                                        onChange={() => setOutcome("no_show")}
                                    />
                                    No-show — family did not attend
                                </label>
                            </div>
                        </div>
                    }
                    {error ?
                        <ActionModalStatusMessage type="error" message={error} />
                    :   null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                    >
                        {successMessage ? "Done" : "Cancel"}
                    </button>
                    {!successMessage ?
                        <button
                            type="button"
                            disabled={!canSubmit}
                            onClick={async () => {
                                if (!outcome) return;
                                setBusy(true);
                                setError(null);
                                try {
                                    await onSubmit({ outcome });
                                    setSuccessMessage("Tour outcome recorded.");
                                    window.setTimeout(() => onClose(), SUCCESS_DISMISS_MS);
                                } catch (e) {
                                    setError(e instanceof Error ? e.message : "Save failed");
                                } finally {
                                    setBusy(false);
                                }
                            }}
                            className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                            {busy ? "Saving…" : "Save outcome"}
                        </button>
                    :   null}
                </div>
            </div>
        </>
    );
}
