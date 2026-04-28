"use client";

import { useEffect, useMemo, useState } from "react";

type StatusOption = { value: string; label: string };

export function UpdateStatusAddNoteModal(props: {
    open: boolean;
    title?: string;
    statusOptions: StatusOption[];
    initialStatusKey?: string | null;
    onClose: () => void;
    onSubmit: (payload: { status_key: string; note: string; next_step: string }) => Promise<void>;
}) {
    const { open, title = "Update status", statusOptions, initialStatusKey, onClose, onSubmit } = props;
    const [statusKey, setStatusKey] = useState("");
    const [note, setNote] = useState("");
    const [nextStep, setNextStep] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setStatusKey(initialStatusKey ?? "");
        setNote("");
        setNextStep("");
        setError(null);
        setBusy(false);
    }, [open, initialStatusKey]);

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel = "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/50";
    const input =
        "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

    const statusOptionsResolved = useMemo(() => {
        const base = statusOptions ?? [];
        const sorted = [...base].sort((a, b) => a.label.localeCompare(b.label));
        return sorted;
    }, [statusOptions]);

    if (!open) return null;

    return (
        <>
            <div className={overlay} onClick={() => (!busy ? onClose() : null)} />
            <div className={panel} role="dialog" aria-modal="true" aria-label={title}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-alloy-stone/15">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            Update the opportunity status and log a quick note.
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

                <div className="px-5 py-4 space-y-3">
                    <div>
                        <div className={label}>Status</div>
                        <select
                            value={statusKey}
                            disabled={busy}
                            onChange={(e) => setStatusKey(e.target.value)}
                            className={input}
                        >
                            <option value="">Select…</option>
                            {statusOptionsResolved.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <div className={label}>Note</div>
                        <textarea
                            value={note}
                            disabled={busy}
                            onChange={(e) => setNote(e.target.value)}
                            className={input}
                            rows={4}
                            placeholder="Add a quick note (optional)."
                        />
                        <div className="mt-1 text-[11px] text-alloy-midnight/45">
                            Notes are stored on the opportunity for now (Enrollment V1).
                        </div>
                    </div>
                    <div>
                        <div className={label}>Next step (optional)</div>
                        <input
                            value={nextStep}
                            disabled={busy}
                            onChange={(e) => setNextStep(e.target.value)}
                            className={input}
                            placeholder="e.g. Confirm tour date with parent"
                        />
                    </div>
                    {error ? (
                        <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                            {error}
                        </div>
                    ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-alloy-stone/15">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={busy || !statusKey.trim()}
                        onClick={async () => {
                            if (!statusKey.trim()) return;
                            setBusy(true);
                            setError(null);
                            try {
                                await onSubmit({ status_key: statusKey.trim(), note: note.trim(), next_step: nextStep.trim() });
                                onClose();
                            } catch (e) {
                                setError(e instanceof Error ? e.message : "Save failed");
                            } finally {
                                setBusy(false);
                            }
                        }}
                        className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {busy ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </>
    );
}

