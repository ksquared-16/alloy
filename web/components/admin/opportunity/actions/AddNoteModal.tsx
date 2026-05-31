"use client";

import { useEffect, useMemo, useState } from "react";

export function AddNoteModal(props: {
    open: boolean;
    title?: string;
    onClose: () => void;
    onSubmit: (payload: { note: string }) => Promise<void>;
}) {
    const { open, title = "Add note", onClose, onSubmit } = props;
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setNote("");
        setError(null);
        setBusy(false);
    }, [open]);

    const canSubmit = useMemo(() => !busy && note.trim().length > 0, [busy, note]);

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold tracking-wide text-alloy-forge/50";
    const input =
        "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

    if (!open) return null;

    return (
        <>
            <div className={overlay} onClick={() => (!busy ? onClose() : null)} />
            <div className={panel} role="dialog" aria-modal="true" aria-label={title}>
                <div className="flex items-start justify-between gap-3 border-b border-alloy-stone/15 px-5 py-4">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            Add a note to the activity timeline without changing status.
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
                    <div>
                        <div className={label}>Note</div>
                        <textarea
                            value={note}
                            disabled={busy}
                            onChange={(e) => setNote(e.target.value)}
                            className={input}
                            rows={4}
                            placeholder="What should the team know?"
                        />
                    </div>
                    {error ? (
                        <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                            {error}
                        </div>
                    ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4">
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
                        disabled={!canSubmit}
                        onClick={async () => {
                            setBusy(true);
                            setError(null);
                            try {
                                await onSubmit({ note: note.trim() });
                                onClose();
                            } catch (e) {
                                setError(e instanceof Error ? e.message : "Add note failed");
                            } finally {
                                setBusy(false);
                            }
                        }}
                        className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {busy ? "Saving…" : "Add note"}
                    </button>
                </div>
            </div>
        </>
    );
}
