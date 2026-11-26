"use client";

import { useEffect, useState } from "react";
import ProcessingAlloyDialog from "./ProcessingAlloyDialog";

export default function ProcessingRenameDocumentDialog({
    open,
    documentId,
    initialName,
    onClose,
    onRenamed,
}: {
    open: boolean;
    documentId: string | null;
    initialName: string;
    onClose: () => void;
    onRenamed: (displayName: string) => void;
}) {
    const [name, setName] = useState(initialName);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setName(initialName);
            setErr(null);
        }
    }, [open, initialName]);

    async function handleSave() {
        if (!documentId) return;
        const trimmed = name.trim();
        if (!trimmed) {
            setErr("Display name cannot be empty.");
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/pos/documents/${documentId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ display_name: trimmed }),
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string; data?: { display_name?: string } };
            if (!res.ok) throw new Error(body.error || `Rename failed (${res.status})`);
            onRenamed(body.data?.display_name ?? trimmed);
            onClose();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Rename failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title="Rename document"
            subtitle="Updates the operator-facing display name only. The original filename is preserved."
            testId="processing-rename-document-dialog"
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70">
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={busy || !documentId}
                        onClick={() => void handleSave()}
                        className="rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                    >
                        {busy ? "Saving…" : "Save name"}
                    </button>
                </>
            }
        >
            <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-alloy-midnight">Display name</span>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-[10px] border border-alloy-stone/20 px-3 py-2.5 text-[13px] shadow-sm outline-none focus:border-alloy-bend-pine/40 focus:ring-2 focus:ring-alloy-bend-pine/15"
                    data-testid="processing-rename-document-input"
                />
            </label>
            {err ? <p className="mt-2 text-[11px] text-red-700">{err}</p> : null}
        </ProcessingAlloyDialog>
    );
}
