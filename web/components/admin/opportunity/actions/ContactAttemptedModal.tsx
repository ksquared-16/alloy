"use client";

import { useEffect, useMemo, useState } from "react";

export function ContactAttemptedModal(props: {
    open: boolean;
    title?: string;
    onClose: () => void;
    onSubmit: (payload: { note: string; last_contact_attempt_method: string }) => Promise<void>;
}) {
    const { open, title = "Log contact attempt", onClose, onSubmit } = props;
    const [note, setNote] = useState("");
    const [method, setMethod] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setNote("");
        setMethod("");
        setError(null);
        setBusy(false);
    }, [open]);

    const canSubmit = useMemo(() => !busy, [busy]);

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/50";
    const input =
        "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

    if (!open) return null;

    return (
        <>
            <div className={overlay} onClick={() => (!busy ? onClose() : null)} />
            <div className={panel} role="dialog" aria-modal="true" aria-label={title}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-alloy-stone/15">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            Record that you attempted to contact this family.
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
                        <div className={label}>Method (optional)</div>
                        <select
                            value={method}
                            disabled={busy}
                            onChange={(e) => setMethod(e.target.value)}
                            className={input}
                        >
                            <option value="">Select…</option>
                            <option value="call">Call</option>
                            <option value="sms">Text</option>
                            <option value="email">Email</option>
                            <option value="in_person">In person</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div>
                        <div className={label}>Note (optional)</div>
                        <textarea
                            value={note}
                            disabled={busy}
                            onChange={(e) => setNote(e.target.value)}
                            className={input}
                            rows={4}
                            placeholder="Add a quick note about what you tried."
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
                        disabled={!canSubmit}
                        onClick={async () => {
                            setBusy(true);
                            setError(null);
                            try {
                                await onSubmit({
                                    note: note.trim(),
                                    last_contact_attempt_method: method.trim(),
                                });
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

