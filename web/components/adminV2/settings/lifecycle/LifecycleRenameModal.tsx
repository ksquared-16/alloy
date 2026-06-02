"use client";

import { useEffect, useState } from "react";
import { LIFECYCLE_DESCRIPTION_MAX_CHARS } from "@/lib/lifecycle/lifecycleBuilderConfig";

export default function LifecycleRenameModal({
    open,
    currentName,
    currentDescription = "",
    busy,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    currentName: string;
    currentDescription?: string;
    busy: boolean;
    onCancel: () => void;
    onConfirm: (values: { name: string; description: string }) => void | Promise<void>;
}) {
    const [name, setName] = useState(currentName);
    const [description, setDescription] = useState(currentDescription);

    useEffect(() => {
        if (open) {
            setName(currentName);
            setDescription(currentDescription);
        }
    }, [open, currentName, currentDescription]);

    if (!open) return null;

    const descLen = description.length;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/40 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="lifecycle-rename-modal"
        >
            <div className="w-full max-w-sm rounded-xl border border-alloy-forge/15 bg-white p-5 shadow-lg">
                <h3 className="text-sm font-semibold text-alloy-midnight">Edit lifecycle</h3>
                <label className="mt-3 block text-xs font-medium text-alloy-midnight/70">
                    Lifecycle name
                    <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-3 py-2 text-sm"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        data-testid="lifecycle-rename-input"
                    />
                </label>
                <label className="mt-3 block text-xs font-medium text-alloy-midnight/70">
                    Description (optional)
                    <textarea
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-3 py-2 text-sm"
                        rows={2}
                        maxLength={LIFECYCLE_DESCRIPTION_MAX_CHARS}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        data-testid="lifecycle-rename-description-input"
                    />
                    <span className="mt-1 block text-[11px] text-alloy-midnight/50">
                        Shown on the workspace tile. {descLen}/{LIFECYCLE_DESCRIPTION_MAX_CHARS}
                    </span>
                </label>
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        className="rounded-md border px-3 py-1.5 text-xs"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        disabled={busy || !name.trim()}
                        onClick={() => void onConfirm({ name: name.trim(), description: description.trim() })}
                        data-testid="lifecycle-rename-confirm"
                    >
                        {busy ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
